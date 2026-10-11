-- Read-only checks before applying migration 0006. Output contains aggregate
-- counts only; it never returns account IDs, emails, preferences, or credentials.
SELECT '0006 migration is not already applied' AS check_name,
  NOT EXISTS (SELECT 1 FROM d1_migrations WHERE name = '0006_retire_firebase_auth.sql') AS passed;

SELECT 'Firebase identities have canonical Better Auth mappings' AS check_name,
  NOT EXISTS (
    SELECT 1 FROM auth_identities AS firebase_identity
    WHERE firebase_identity.provider = 'firebase'
      AND NOT EXISTS (
        SELECT 1 FROM auth_identities AS better_auth_identity
        JOIN user AS auth_user ON auth_user.id = better_auth_identity.app_user_id
        WHERE better_auth_identity.provider = 'better-auth'
          AND better_auth_identity.app_user_id = firebase_identity.app_user_id
          AND better_auth_identity.provider_subject = firebase_identity.app_user_id
      )
  ) AS passed;

SELECT 'Better Auth identities are canonical and have users' AS check_name,
  NOT EXISTS (
    SELECT 1 FROM auth_identities AS better_auth_identity
    LEFT JOIN user AS auth_user ON auth_user.id = better_auth_identity.app_user_id
    WHERE better_auth_identity.provider = 'better-auth'
      AND (better_auth_identity.provider_subject <> better_auth_identity.app_user_id OR auth_user.id IS NULL)
  ) AS passed;

SELECT 'Every Better Auth user has a canonical identity' AS check_name,
  NOT EXISTS (
    SELECT 1 FROM user AS auth_user
    WHERE NOT EXISTS (
      SELECT 1 FROM auth_identities AS better_auth_identity
      WHERE better_auth_identity.provider = 'better-auth'
        AND better_auth_identity.app_user_id = auth_user.id
        AND better_auth_identity.provider_subject = auth_user.id
    )
  ) AS passed;

SELECT 'Every app user has a Better Auth identity' AS check_name,
  NOT EXISTS (
    SELECT 1 FROM app_users AS app_user
    WHERE NOT EXISTS (
      SELECT 1 FROM auth_identities AS better_auth_identity
      WHERE better_auth_identity.provider = 'better-auth'
        AND better_auth_identity.app_user_id = app_user.id
        AND better_auth_identity.provider_subject = app_user.id
    )
  ) AS passed;

SELECT 'Legacy registration contexts are empty' AS check_name,
  NOT EXISTS (SELECT 1 FROM auth_registration_contexts) AS passed;

SELECT 'Legacy registration claims are completed and mapped' AS check_name,
  NOT EXISTS (
    SELECT 1 FROM auth_registration_context_claims AS claim
    WHERE claim.completed_at IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM auth_registration_context_completions AS completion
        WHERE completion.nonce = claim.nonce
          AND completion.app_user_id = claim.app_user_id
          AND completion.completed_at = claim.completed_at
      )
      OR NOT EXISTS (
        SELECT 1 FROM auth_identities AS better_auth_identity
        WHERE better_auth_identity.provider = 'better-auth'
          AND better_auth_identity.app_user_id = claim.app_user_id
          AND better_auth_identity.provider_subject = claim.app_user_id
      )
  ) AS passed;

SELECT 'Legacy registration completions match claims' AS check_name,
  NOT EXISTS (
    SELECT 1 FROM auth_registration_context_completions AS completion
    WHERE NOT EXISTS (
      SELECT 1 FROM auth_registration_context_claims AS claim
      WHERE claim.nonce = completion.nonce
        AND claim.app_user_id = completion.app_user_id
        AND claim.completed_at = completion.completed_at
    )
  ) AS passed;

SELECT
  'Firebase identity mappings to remove' AS metric,
  count(*) AS rows
FROM auth_identities
WHERE provider = 'firebase';

SELECT
  'Completed legacy registration claims to remove' AS metric,
  count(*) AS rows
FROM auth_registration_context_claims;

SELECT
  'Legacy registration completions to remove' AS metric,
  count(*) AS rows
FROM auth_registration_context_completions;

SELECT 'D1 preference records to preserve' AS metric, count(*) AS rows
FROM user_preferences;

SELECT 'Plugin override records to preserve' AS metric, count(*) AS rows
FROM plugin_enabled_overrides;
