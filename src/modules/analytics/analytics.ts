import { type Mixpanel } from 'mixpanel-browser';
import mixpanel from 'mixpanel-browser/src/loaders/loader-module-core';

import { storage } from './storage';
import type { AnalyticsConfig, TrackedUser, TrackingProperty } from './types';

/**
 * The Analytics class provides methods for initializing and configuring Mixpanel.
 * Reusable across all Insightt applications.
 */
class Analytics {
  private mixpanel: Mixpanel | null = null;
  private readonly mixpanelToken: string | null;
  private isIdentified: boolean = false;

  constructor(mixpanelToken: string | null, instanceName: string) {
    this.mixpanelToken = mixpanelToken;

    if (this.mixpanelToken) {
      mixpanel.init(
        this.mixpanelToken,
        {
          persistence: 'localStorage',
          loaded: (mp: Mixpanel) => {
            this.mixpanel = mp;
          },
          ignore_dnt: true,
        },
        instanceName,
      );
    }
    this.checkAnonymousIdentify();
  }

  isEnabled(): boolean {
    return this.mixpanelToken !== null && this.mixpanel !== null;
  }

  getDoNotTrack(): boolean {
    if (typeof window === 'undefined') return false;

    // Handle various browser implementations
    let dnt =
      navigator.doNotTrack ??
      (window as any).doNotTrack ??
      (navigator as any).msDoNotTrack;

    if (!dnt || dnt === 'unspecified') {
      dnt = (navigator as any).globalPrivacyControl ?? null;
    }

    const val = String(dnt).toLowerCase();

    const truthy = new Set(['1', 'yes', 'true']);
    const falsy = new Set(['0', 'no', 'false']);

    if (truthy.has(val)) return true;
    if (falsy.has(val)) return false;

    return false;
  }

  /**
   * Get or create an anonymous user ID
   */
  anonymousIdentify(): string {
    let anonymousUserId = storage.get('anonymous_user_id');
    const anonymousUserIdExists = anonymousUserId !== null;
    if (!anonymousUserIdExists) {
      anonymousUserId = crypto.randomUUID();
      storage.set('anonymous_user_id', anonymousUserId);
    }
    return anonymousUserId!;
  }

  checkAnonymousIdentify(): void {
    const userStr = storage.get('user');
    const user = userStr ? JSON.parse(userStr) : undefined;
    if (!user) {
      return;
    }

    if (!this.mixpanel) {
      return;
    }

    if (
      this.getDoNotTrack() &&
      this.mixpanel.get_distinct_id() != this.anonymousIdentify()
    ) {
      this.mixpanel.reset();
      this.mixpanel.identify(this.anonymousIdentify());
    } else if (
      !this.getDoNotTrack() &&
      this.mixpanel.get_distinct_id() != String(user.id)
    ) {
      this.mixpanel.reset();
      this.mixpanel.identify(String(user.id));
    }
  }

  identify(user: TrackedUser): void {
    if (!this.mixpanel) {
      return;
    }

    if (this.getDoNotTrack()) {
      this.isIdentified = true;
      this.mixpanel.identify(String(this.anonymousIdentify()));
      return;
    }

    this.isIdentified = true;
    this.mixpanel.identify(String(user.id));
    this.mixpanel.people.set({
      $id: user.id,
      $email: user.email,
      $first_name: user.firstName,
      $last_name: user.lastName,
      $role: user.role,
      $role_id: user.roleId,
      $type: user.type,
      $company: user.company,
      $company_id: user.companyId,
      $phone_number: user.phoneNumber,
      $plan: user.currentPlan,
      $tier: user.tier,
      $device_type: user.deviceType,
    });

    storage.set('user', JSON.stringify({ id: user.id }));
  }

  track(event: string, eventObject?: TrackingProperty): void {
    if (!this.isIdentified || !this.mixpanel) {
      return;
    }

    this.checkAnonymousIdentify();
    this.mixpanel.track(event, eventObject);
  }

  reset(): void {
    if (this.mixpanel) {
      this.mixpanel.reset();
    }
    this.isIdentified = false;
    storage.remove('user');
  }
}

// Singleton instance
let instance: Analytics | null = null;
let currentConfig: AnalyticsConfig | null = null;

/**
 * Initialize analytics with a configuration.
 * Must be called before using `analytics()`.
 */
export function initAnalytics(config: AnalyticsConfig): Analytics {
  if (instance && currentConfig?.instanceName === config.instanceName) {
    return instance;
  }
  currentConfig = config;
  instance = new Analytics(config.token, config.instanceName);
  return instance;
}

/**
 * Get the Analytics singleton instance.
 * Throws if `initAnalytics` has not been called.
 */
export const analytics = (): Analytics => {
  if (!instance) {
    throw new Error('Analytics not initialized. Call initAnalytics() first.');
  }
  return instance;
};

export function createAnalyticEvent(
  event: string,
): (extra?: TrackingProperty) => void;

export function createAnalyticEvent<T>(
  event: string,
  mapProperties: (entry: T) => TrackingProperty,
): <U extends T>(input: U, extra?: TrackingProperty) => void;

export function createAnalyticEvent<T>(
  event: string,
  mapProperties?: (entry: T) => TrackingProperty,
) {
  return <U extends T>(input?: U, extra?: TrackingProperty) => {
    const properties =
      mapProperties && input
        ? mapProperties(input)
        : (input as TrackingProperty | undefined);

    analytics().track(event, {
      ...(analytics().getDoNotTrack()
        ? {
            $anonymous_id: analytics().anonymousIdentify(),
          }
        : {
            ...properties,
            ...(extra ?? {}),
          }),
    });
  };
}

/**
 * Identify a user for analytics tracking.
 */
export const identify = (user: TrackedUser): void => {
  analytics().identify(user);
};

export { Analytics };
