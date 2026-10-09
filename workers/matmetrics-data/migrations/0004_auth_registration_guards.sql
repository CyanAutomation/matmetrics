-- Keep short-lived registration reservations independent from app_users. A
-- failed or abandoned WebAuthn ceremony must not create an account identity.
CREATE TABLE auth_registration_context_claims (
  nonce TEXT PRIMARY KEY,
  app_user_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('firebase', 'better-auth')),
  provider_subject TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  completed_at INTEGER,
  created_at INTEGER NOT NULL
) STRICT;

CREATE TABLE auth_registration_context_completions (
  nonce TEXT PRIMARY KEY REFERENCES auth_registration_context_claims(nonce) ON DELETE CASCADE,
  app_user_id TEXT NOT NULL,
  completed_at INTEGER NOT NULL
) STRICT;

CREATE TRIGGER validate_auth_registration_context_completion
BEFORE INSERT ON auth_registration_context_completions
WHEN NOT EXISTS (
  SELECT 1 FROM auth_registration_context_claims
  WHERE nonce = NEW.nonce
    AND app_user_id = NEW.app_user_id
    AND completed_at IS NULL
    AND expires_at > (unixepoch() * 1000)
)
BEGIN
  SELECT RAISE(ABORT, 'PASSKEY_REGISTRATION_CONTEXT_INVALID');
END;

-- The guard runs inside SQLite's DELETE statement, so two concurrent deletes
-- cannot both observe a credential count greater than one.
CREATE TRIGGER prevent_final_passkey_deletion
BEFORE DELETE ON passkey
WHEN (SELECT count(*) FROM passkey WHERE userId = OLD.userId) <= 1
BEGIN
  SELECT RAISE(ABORT, 'LAST_PASSKEY_REQUIRED');
END;

-- Remove the pre-hardening reservations and the Better Auth identity rows that
-- were written before a passkey user existed. Verified Firebase identities are
-- retained, as are all users that already have a Better Auth account.
DELETE FROM auth_registration_contexts;

DELETE FROM auth_identities
WHERE provider = 'better-auth'
  AND NOT EXISTS (SELECT 1 FROM user WHERE user.id = auth_identities.app_user_id);

DELETE FROM app_users
WHERE NOT EXISTS (
  SELECT 1 FROM auth_identities WHERE auth_identities.app_user_id = app_users.id
);
