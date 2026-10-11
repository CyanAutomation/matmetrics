-- Read-only verification after migration 0006. Output contains aggregate counts
-- only and confirms the Better Auth identity invariant remains intact.
SELECT '0006 migration history row' AS check_name,
  EXISTS (SELECT 1 FROM d1_migrations WHERE name = '0006_retire_firebase_auth.sql') AS passed;

SELECT 'Firebase identity rows removed' AS check_name,
  NOT EXISTS (SELECT 1 FROM auth_identities WHERE provider = 'firebase') AS passed;

SELECT 'Identity schema accepts only Better Auth' AS check_name,
  EXISTS (
    SELECT 1 FROM sqlite_master
    WHERE type = 'table' AND name = 'auth_identities'
      AND instr(lower(sql), 'better-auth') > 0 AND instr(lower(sql), 'firebase') = 0
  ) AS passed;

SELECT 'Legacy registration tables removed' AS check_name,
  NOT EXISTS (
    SELECT 1 FROM sqlite_master
    WHERE type = 'table'
      AND name IN ('auth_registration_contexts', 'auth_registration_context_claims', 'auth_registration_context_completions')
  ) AS passed;

SELECT 'Legacy registration trigger removed' AS check_name,
  NOT EXISTS (
    SELECT 1 FROM sqlite_master
    WHERE type = 'trigger' AND name = 'validate_auth_registration_context_completion'
  ) AS passed;

SELECT 'Better Auth identity insert trigger retained' AS check_name,
  EXISTS (
    SELECT 1 FROM sqlite_master
    WHERE type = 'trigger' AND name = 'ensure_better_auth_identity_after_user_insert'
  ) AS passed;

SELECT 'Better Auth pre-insert conflict trigger retained' AS check_name,
  EXISTS (
    SELECT 1 FROM sqlite_master
    WHERE type = 'trigger' AND name = 'reject_better_auth_identity_conflict_before_user_insert'
  ) AS passed;

SELECT 'Final passkey deletion trigger retained' AS check_name,
  EXISTS (
    SELECT 1 FROM sqlite_master
    WHERE type = 'trigger' AND name = 'prevent_final_passkey_deletion'
  ) AS passed;

SELECT 'Better Auth users retain canonical identity mappings' AS check_name,
  NOT EXISTS (
    SELECT 1 FROM user AS auth_user
    WHERE NOT EXISTS (SELECT 1 FROM app_users WHERE app_users.id = auth_user.id)
      OR NOT EXISTS (
        SELECT 1 FROM auth_identities
        WHERE auth_identities.provider = 'better-auth'
          AND auth_identities.app_user_id = auth_user.id
          AND auth_identities.provider_subject = auth_user.id
      )
  ) AS passed;

SELECT 'Retirement guard table removed' AS check_name,
  NOT EXISTS (
    SELECT 1 FROM sqlite_master
    WHERE type = 'table' AND name = 'auth_firebase_retirement_guard'
  ) AS passed;

SELECT 'Firebase identity mappings remaining' AS metric, count(*) AS rows
FROM auth_identities
WHERE provider = 'firebase';

SELECT
  'Legacy registration tables remaining' AS metric,
  count(*) AS rows
FROM sqlite_master
WHERE type = 'table'
  AND name IN (
    'auth_registration_contexts',
    'auth_registration_context_claims',
    'auth_registration_context_completions'
  );

SELECT 'Better Auth identity mappings' AS metric, count(*) AS rows
FROM auth_identities
WHERE provider = 'better-auth';

SELECT 'D1 preference records preserved' AS metric, count(*) AS rows
FROM user_preferences;

SELECT 'Plugin override records preserved' AS metric, count(*) AS rows
FROM plugin_enabled_overrides;
