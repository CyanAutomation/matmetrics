-- Remove Firebase-only authentication metadata after every affected account
-- has a canonical Better Auth identity. User IDs and application data remain.

-- Fail before touching identity rows if any Firebase account was not migrated,
-- any Better Auth identity is noncanonical, or a legacy registration is still
-- incomplete. The guard table is reusable if a failed migration is retried.
CREATE TABLE IF NOT EXISTS auth_firebase_retirement_guard (
  valid INTEGER NOT NULL CHECK (valid = 1)
) STRICT;

DELETE FROM auth_firebase_retirement_guard;

INSERT INTO auth_firebase_retirement_guard (valid)
SELECT CASE WHEN
  NOT EXISTS (
    SELECT 1
    FROM auth_identities AS firebase_identity
    WHERE firebase_identity.provider = 'firebase'
      AND NOT EXISTS (
        SELECT 1
        FROM auth_identities AS better_auth_identity
        JOIN user AS auth_user ON auth_user.id = better_auth_identity.app_user_id
        WHERE better_auth_identity.provider = 'better-auth'
          AND better_auth_identity.app_user_id = firebase_identity.app_user_id
          AND better_auth_identity.provider_subject = firebase_identity.app_user_id
      )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM auth_identities AS better_auth_identity
    LEFT JOIN user AS auth_user ON auth_user.id = better_auth_identity.app_user_id
    WHERE better_auth_identity.provider = 'better-auth'
      AND (
        better_auth_identity.provider_subject <> better_auth_identity.app_user_id
        OR auth_user.id IS NULL
      )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM user AS auth_user
    WHERE NOT EXISTS (
      SELECT 1
      FROM auth_identities AS better_auth_identity
      WHERE better_auth_identity.provider = 'better-auth'
        AND better_auth_identity.app_user_id = auth_user.id
        AND better_auth_identity.provider_subject = auth_user.id
    )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM app_users AS app_user
    WHERE NOT EXISTS (
      SELECT 1
      FROM auth_identities AS better_auth_identity
      WHERE better_auth_identity.provider = 'better-auth'
        AND better_auth_identity.app_user_id = app_user.id
        AND better_auth_identity.provider_subject = app_user.id
    )
  )
  AND NOT EXISTS (SELECT 1 FROM auth_registration_contexts)
  AND NOT EXISTS (
    SELECT 1
    FROM auth_registration_context_claims AS claim
    WHERE claim.completed_at IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM auth_registration_context_completions AS completion
        WHERE completion.nonce = claim.nonce
          AND completion.app_user_id = claim.app_user_id
          AND completion.completed_at = claim.completed_at
      )
      OR NOT EXISTS (
        SELECT 1
        FROM auth_identities AS better_auth_identity
        WHERE better_auth_identity.provider = 'better-auth'
          AND better_auth_identity.app_user_id = claim.app_user_id
          AND better_auth_identity.provider_subject = claim.app_user_id
      )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM auth_registration_context_completions AS completion
    WHERE NOT EXISTS (
      SELECT 1
      FROM auth_registration_context_claims AS claim
      WHERE claim.nonce = completion.nonce
        AND claim.app_user_id = completion.app_user_id
        AND claim.completed_at = completion.completed_at
    )
  )
THEN 1 ELSE 0 END;

DELETE FROM auth_firebase_retirement_guard;

-- Rebuild the live identity table with Better Auth as its only valid provider.
-- Copying is deliberately limited to Better Auth only after the guard proves
-- every Firebase mapping is redundant with the same canonical account.
CREATE TABLE IF NOT EXISTS auth_identities_better_auth (
  id TEXT PRIMARY KEY,
  app_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider = 'better-auth'),
  provider_subject TEXT NOT NULL CHECK (provider_subject = app_user_id),
  created_at INTEGER NOT NULL,
  UNIQUE (provider, provider_subject),
  UNIQUE (app_user_id, provider)
) STRICT;

DELETE FROM auth_identities_better_auth;

INSERT INTO auth_identities_better_auth (
  id,
  app_user_id,
  provider,
  provider_subject,
  created_at
)
SELECT id, app_user_id, provider, provider_subject, created_at
FROM auth_identities
WHERE provider = 'better-auth';

DROP TRIGGER IF EXISTS ensure_better_auth_identity_after_user_insert;
DROP TRIGGER IF EXISTS reject_better_auth_identity_conflict_before_user_insert;
DROP INDEX IF EXISTS auth_identities_user_idx;
DROP TABLE auth_identities;
ALTER TABLE auth_identities_better_auth RENAME TO auth_identities;
CREATE INDEX auth_identities_user_idx ON auth_identities (app_user_id);

CREATE TRIGGER ensure_better_auth_identity_after_user_insert
AFTER INSERT ON user
BEGIN
  SELECT RAISE(ABORT, 'BETTER_AUTH_IDENTITY_CONFLICT')
  WHERE EXISTS (
    SELECT 1
    FROM auth_identities
    WHERE provider = 'better-auth'
      AND (
        (provider_subject = NEW.id AND app_user_id <> NEW.id)
        OR (app_user_id = NEW.id AND provider_subject <> NEW.id)
      )
  );

  INSERT OR IGNORE INTO app_users (id, created_at, updated_at)
  VALUES (
    NEW.id,
    CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER),
    CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
  );

  INSERT INTO auth_identities (
    id,
    app_user_id,
    provider,
    provider_subject,
    created_at
  ) SELECT
    'better-auth:' || NEW.id,
    NEW.id,
    'better-auth',
    NEW.id,
    CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
  WHERE NOT EXISTS (
    SELECT 1
    FROM auth_identities
    WHERE provider = 'better-auth'
      AND app_user_id = NEW.id
      AND provider_subject = NEW.id
  );
END;

CREATE TRIGGER reject_better_auth_identity_conflict_before_user_insert
BEFORE INSERT ON user
WHEN EXISTS (
  SELECT 1
  FROM auth_identities
  WHERE provider = 'better-auth'
    AND (
      (provider_subject = NEW.id AND app_user_id <> NEW.id)
      OR (app_user_id = NEW.id AND provider_subject <> NEW.id)
    )
)
BEGIN
  SELECT RAISE(ABORT, 'BETTER_AUTH_IDENTITY_CONFLICT');
END;

DROP TRIGGER IF EXISTS validate_auth_registration_context_completion;
DROP TABLE auth_registration_context_completions;
DROP TABLE auth_registration_context_claims;
DROP TABLE auth_registration_contexts;
DROP TABLE auth_firebase_retirement_guard;
