import {
  assertIdentityLinkAllowed,
  IdentityLinkConflictError,
  type AuthIdentity,
} from '../../../src/lib/auth-identity';

export { betterAuthIdentityForUser, firebaseIdentityForUid } from '../../../src/lib/auth-identity';

export async function ensureAuthIdentity(
  db: D1Database,
  identity: AuthIdentity,
  now = Date.now()
): Promise<void> {
  const existing = await db
    .prepare(
      'SELECT app_user_id FROM auth_identities WHERE provider = ? AND provider_subject = ?'
    )
    .bind(identity.provider, identity.providerSubject)
    .first<{ app_user_id: string }>();

  assertIdentityLinkAllowed(identity, existing?.app_user_id ?? null);

  const existingProviderIdentity = await db
    .prepare(
      'SELECT provider_subject FROM auth_identities WHERE app_user_id = ? AND provider = ?'
    )
    .bind(identity.appUserId, identity.provider)
    .first<{ provider_subject: string }>();
  if (
    existingProviderIdentity &&
    existingProviderIdentity.provider_subject !== identity.providerSubject
  ) {
    throw new IdentityLinkConflictError();
  }

  await db.batch([
    db
      .prepare(
        'INSERT OR IGNORE INTO app_users (id, created_at, updated_at) VALUES (?, ?, ?)'
      )
      .bind(identity.appUserId, now, now),
    db
      .prepare(
        'INSERT OR IGNORE INTO auth_identities (id, app_user_id, provider, provider_subject, created_at) VALUES (?, ?, ?, ?, ?)'
      )
      .bind(
        crypto.randomUUID(),
        identity.appUserId,
        identity.provider,
        identity.providerSubject,
        now
      ),
  ]);

  const mapping = await db
    .prepare(
      'SELECT app_user_id FROM auth_identities WHERE provider = ? AND provider_subject = ?'
    )
    .bind(identity.provider, identity.providerSubject)
    .first<{ app_user_id: string }>();
  assertIdentityLinkAllowed(identity, mapping?.app_user_id ?? null);

  const finalProviderIdentity = await db
    .prepare(
      'SELECT provider_subject FROM auth_identities WHERE app_user_id = ? AND provider = ?'
    )
    .bind(identity.appUserId, identity.provider)
    .first<{ provider_subject: string }>();
  if (
    finalProviderIdentity &&
    finalProviderIdentity.provider_subject !== identity.providerSubject
  ) {
    throw new IdentityLinkConflictError();
  }
}
