import { getFirebaseAdminAuth } from './firebase-admin-auth';
import { isFirebaseAdminConfigured } from './firebase-admin';
import { AuthConfigurationError } from './server-auth-errors';
import type { AuthenticatedPrincipal } from './server-auth-types';

export async function verifyFirebaseToken(
  token: string
): Promise<AuthenticatedPrincipal> {
  if (!isFirebaseAdminConfigured()) throw new AuthConfigurationError();
  const decoded = await getFirebaseAdminAuth().verifyIdToken(token);
  return {
    userId: decoded.uid,
    appUserId: decoded.uid,
    provider: 'firebase',
    email: typeof decoded.email === 'string' ? decoded.email : null,
    displayName: typeof decoded.name === 'string' ? decoded.name : null,
    emailVerified: decoded.email_verified === true,
  };
}
