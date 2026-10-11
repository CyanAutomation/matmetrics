export type AuthIdentity = {
  appUserId: string;
  provider: 'better-auth';
  providerSubject: string;
};

export class IdentityLinkConflictError extends Error {
  constructor() {
    super('Authentication identity is already linked to another MatMetrics user');
    this.name = 'IdentityLinkConflictError';
  }
}

export function assertIdentityLinkAllowed(
  identity: AuthIdentity,
  existingAppUserId: string | null
): void {
  if (existingAppUserId && existingAppUserId !== identity.appUserId) {
    throw new IdentityLinkConflictError();
  }
}

export function betterAuthIdentityForUser(
  appUserId: string,
  betterAuthUserId = appUserId
): AuthIdentity {
  if (!appUserId.trim() || !betterAuthUserId.trim()) {
    throw new Error('Canonical and Better Auth user IDs are required');
  }
  return {
    appUserId,
    provider: 'better-auth',
    providerSubject: betterAuthUserId,
  };
}
