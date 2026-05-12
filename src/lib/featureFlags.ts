/**
 * Utility to query application feature flags based on configuration modes (single/multi).
 * 
 * In single-mode (household/personal deployment):
 * - User self-registration is typically disabled.
 * - Only the predefined admin (and optional invited users) can log in.
 * 
 * Environment variables mapped:
 * - APP_MODE / NEXT_PUBLIC_APP_MODE (single | multi)
 * - ENABLE_SIGNUP / NEXT_PUBLIC_ENABLE_SIGNUP (true | false)
 */

export type AppMode = 'single' | 'multi';

/**
 * Returns the current application deployment mode.
 */
export function getAppMode(): AppMode {
  const mode = typeof window !== 'undefined'
    ? process.env.NEXT_PUBLIC_APP_MODE
    : (process.env.APP_MODE || process.env.NEXT_PUBLIC_APP_MODE);

  return mode === 'single' ? 'single' : 'multi';
}

/**
 * Returns whether user signups are enabled for this instance.
 * Defaults to:
 * - false in single mode (household default safety)
 * - true in multi mode (public SaaS default)
 */
export function isSignupEnabled(): boolean {
  const mode = getAppMode();
  const rawSignup = typeof window !== 'undefined'
    ? process.env.NEXT_PUBLIC_ENABLE_SIGNUP
    : (process.env.ENABLE_SIGNUP || process.env.NEXT_PUBLIC_ENABLE_SIGNUP);

  if (rawSignup !== undefined) {
    return rawSignup === 'true' || rawSignup === '1';
  }

  // Fallback defaults based on mode
  return mode === 'multi';
}
