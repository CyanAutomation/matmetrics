-- Read-only preflight for 0004_auth_registration_guards.sql.
-- Run after migrations 0001-0003 and before applying migration 0004.
-- Review every non-zero cleanup count before an operator applies the migration.
SELECT
  'auth_registration_contexts rows cleared by 0004' AS cleanup_target,
  count(*) AS rows_that_would_be_deleted
FROM auth_registration_contexts;

SELECT
  'orphan Better Auth identity rows deleted by 0004' AS cleanup_target,
  count(*) AS rows_that_would_be_deleted
FROM auth_identities
WHERE provider = 'better-auth'
  AND NOT EXISTS (
    SELECT 1 FROM user WHERE user.id = auth_identities.app_user_id
  );

SELECT
  'canonical app_users rows deleted after identity cleanup' AS cleanup_target,
  count(*) AS rows_that_would_be_deleted
FROM app_users
WHERE NOT EXISTS (
  SELECT 1 FROM auth_identities WHERE auth_identities.app_user_id = app_users.id
);

SELECT
  'Firebase identity mappings retained by 0004' AS check_name,
  count(*) AS rows
FROM auth_identities
WHERE provider = 'firebase';

SELECT
  'D1 preference records not modified by 0004' AS check_name,
  count(*) AS rows
FROM user_preferences;
