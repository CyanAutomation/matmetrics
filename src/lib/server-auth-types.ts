export type AuthenticatedPrincipal = {
  /** Provider-specific subject. */
  userId: string;
  /** Stable MatMetrics account key used to scope application data. */
  appUserId: string;
  provider: 'firebase' | 'better-auth' | 'test';
  email: string | null;
  displayName: string | null;
  emailVerified: boolean;
};
