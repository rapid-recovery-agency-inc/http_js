/**
 * Analytics Storage Utility
 *
 * Simple localStorage wrapper for analytics persistence.
 * This module is client-side only and uses browser localStorage.
 */

import type { AnalyticsStorage } from './types';

const STORAGE_PREFIX = 'analytics_';

/**
 * Default storage implementation using localStorage
 */
export const storage: AnalyticsStorage = {
  get(key: string): string | null {
    if (typeof window === 'undefined') return null;
    try {
      return localStorage.getItem(`${STORAGE_PREFIX}${key}`);
    } catch {
      return null;
    }
  },

  set(key: string, value: string): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(`${STORAGE_PREFIX}${key}`, value);
    } catch {
      // Silently fail if localStorage is not available
    }
  },

  remove(key: string): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(`${STORAGE_PREFIX}${key}`);
    } catch {
      // Silently fail if localStorage is not available
    }
  },
};
