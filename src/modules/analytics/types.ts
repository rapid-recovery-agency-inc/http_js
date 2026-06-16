/**
 * Analytics Types
 *
 * Shared analytics type definitions for Mixpanel tracking across Insightt applications.
 */

/**
 * Properties that can be tracked with an event
 */
export type TrackingProperty = Record<string, unknown>;

/**
 * User information for analytics identification.
 */
export interface TrackedUser {
  id: number | string;
  email: string;
  type?: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  roleId?: number | string;
  company?: string;
  companyId?: number | string;
  phoneNumber?: string | null;
  tier?: number;
  deviceType?: string;
  registrationMethod?: string;
  subscriptionDate?: string;
  currentPlan?: string;
  previousPlan?: string;
  subscriptionCancellationDate?: string;
  nextPaymentDate?: string;
}

/**
 * Storage interface for analytics (localStorage abstraction)
 */
export interface AnalyticsStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

/**
 * Configuration options for initializing analytics.
 */
export interface AnalyticsConfig {
  /** Mixpanel project token */
  token: string | null;
  /** Instance name for Mixpanel (e.g. 'Insightt - SSO', 'Insightt - HR') */
  instanceName: string;
}
