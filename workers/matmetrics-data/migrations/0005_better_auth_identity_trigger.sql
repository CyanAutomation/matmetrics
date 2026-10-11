-- Keep the MatMetrics identity row atomic with Better Auth user creation.
-- Better Auth database create.after hooks run after the user transaction commits.

-- Repair canonical mappings for Better Auth users created before this trigger.
INSERT OR IGNORE INTO app_users (id, created_at, updated_at)
SELECT
  id,
  CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER),
  CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
FROM user;

INSERT INTO auth_identities (
  id,
  app_user_id,
  provider,
  provider_subject,
  created_at
)
SELECT
  'better-auth:' || auth_user.id,
  auth_user.id,
  'better-auth',
  auth_user.id,
  CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
FROM user AS auth_user
WHERE NOT EXISTS (
  SELECT 1
  FROM auth_identities
  WHERE provider = 'better-auth'
    AND app_user_id = auth_user.id
    AND provider_subject = auth_user.id
);

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

CREATE TRIGGER ensure_better_auth_identity_after_user_insert
AFTER INSERT ON user
BEGIN
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
  ) VALUES (
    'better-auth:' || NEW.id,
    NEW.id,
    'better-auth',
    NEW.id,
    CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
  ) ON CONFLICT(provider, provider_subject) DO NOTHING;
END;
