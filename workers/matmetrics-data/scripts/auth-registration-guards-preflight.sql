-- Read-only preflight for auth migrations 0004 and 0005.
-- Run after migrations 0001-0003 before 0004, or after 0004 before 0005.
-- Review non-zero cleanup counts and resolve identity conflicts before migration.
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

SELECT
  'Better Auth identity mappings to backfill by 0005' AS cleanup_target,
  count(*) AS rows_that_would_be_added
FROM user AS auth_user
WHERE NOT EXISTS (
  SELECT 1
  FROM auth_identities
  WHERE provider = 'better-auth'
    AND app_user_id = auth_user.id
    AND provider_subject = auth_user.id
);

SELECT
  'Noncanonical Better Auth identity mappings blocking 0005' AS check_name,
  count(*) AS rows
FROM auth_identities
WHERE provider = 'better-auth'
  AND app_user_id <> provider_subject;
