-- Read-only verification of migration 0004_auth_registration_guards.sql.
-- Run against the D1 database that the production auth Worker actually uses.
SELECT
  '0004 migration history row' AS check_name,
  EXISTS (
    SELECT 1 FROM d1_migrations
    WHERE name = '0004_auth_registration_guards.sql'
  ) AS passed
UNION ALL
SELECT
  'registration claims table' AS check_name,
  EXISTS (
    SELECT 1 FROM sqlite_master
    WHERE type = 'table' AND name = 'auth_registration_context_claims'
  ) AS passed
UNION ALL
SELECT
  'registration completions table' AS check_name,
  EXISTS (
    SELECT 1 FROM sqlite_master
    WHERE type = 'table' AND name = 'auth_registration_context_completions'
  ) AS passed
UNION ALL
SELECT
  'registration completion trigger' AS check_name,
  EXISTS (
    SELECT 1 FROM sqlite_master
    WHERE type = 'trigger'
      AND name = 'validate_auth_registration_context_completion'
  ) AS passed
UNION ALL
SELECT
  'final passkey deletion trigger' AS check_name,
  EXISTS (
    SELECT 1 FROM sqlite_master
    WHERE type = 'trigger' AND name = 'prevent_final_passkey_deletion'
  ) AS passed;

-- These aggregate rows contain no account IDs or credential data.
SELECT
  'legacy registration contexts remaining' AS metric,
  count(*) AS rows
FROM auth_registration_contexts;

SELECT
  'orphan Better Auth identities remaining' AS metric,
  count(*) AS rows
FROM auth_identities
WHERE provider = 'better-auth'
  AND NOT EXISTS (
    SELECT 1 FROM user WHERE user.id = auth_identities.app_user_id
  );

SELECT
  'canonical app users without identity mappings' AS metric,
  count(*) AS rows
FROM app_users
WHERE NOT EXISTS (
  SELECT 1 FROM auth_identities WHERE auth_identities.app_user_id = app_users.id
);

SELECT 'Firebase identity mappings retained' AS metric, count(*) AS rows
FROM auth_identities
WHERE provider = 'firebase';

SELECT 'D1 preference records' AS metric, count(*) AS rows
FROM user_preferences;
