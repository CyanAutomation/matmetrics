# GitHub Sync Plugin: Operations Guide

## Purpose and Wiring

- UI contract baseline: [docs/plugin-ui-contract.md](../../docs/plugin-ui-contract.md).

The GitHub Sync plugin adds an operational dashboard tab that lets authenticated users configure a repository, validate connectivity, and run an initial full sync of existing sessions.

### Plugin identity

- **Plugin id:** `github-sync` (manifest id)
- **Extension id:** `github-sync-dashboard-tab` (dashboard tab extension)
- **Component id:** `github_settings` (render target for the dashboard tab)

### Where it is wired

- **Plugin bootstrap:** `plugins/github-sync/src/index.ts`
  - Registers `github-sync-dashboard-tab`
  - Registers `github_settings` and renders `GitHubSettings`
- **Manifest wiring:** `plugins/github-sync/plugin.json`
  - Declares a `dashboard_tab` extension with tab id `github-sync`
  - Uses component id `github_settings`
- **UI component implementation:** `src/components/github-settings.tsx`
  - Implements configuration form, validation flow, and bulk sync flow

## Usage

### Operator/developer quickstart

1. Ensure runtime dependencies are present before opening the UI:
   - Firebase auth + admin configuration
   - `GITHUB_TOKEN` with repository write permissions
2. Start local app runtime:

   ```bash
   npm run dev
   ```

3. Sign in with a user account that can manage the target repository.
4. Navigate to **Dashboard → GitHub Sync** and run the configuration + sync flow.

### Setup prerequisites

#### Authentication requirements

- User must be signed in to use GitHub Sync UI actions.
- Firebase auth must be configured for the deployment; if it is not configured, the plugin shows an unavailable/auth-required warning state.
- Server routes used by this plugin require a Bearer token and authenticated user context.

#### Environment variables and backend requirements

- `GITHUB_TOKEN` (required)
  - Used by server-side GitHub API calls.
  - If missing, validation/sync endpoints return an error (`GITHUB_TOKEN environment variable not configured`).
- Firebase admin configuration (required outside test mode)
  - Needed by server auth verification and user preference retrieval.
- Optional auth test mode variables (for automated tests only):
  - `MATMETRICS_AUTH_TEST_MODE`
  - `MATMETRICS_TEST_USER_GITHUB_CONFIG`

#### Expected GitHub token permissions

- Token must have repository access sufficient to:
  - Read repository metadata and branches.
  - Read/write repository contents (session markdown files and generated README updates).
- In practical terms for classic PATs, `repo` scope is expected.

### Local workflow

#### 1) Confirm dashboard tab appears

1. Start the app:

   ```bash
   npm run dev
   ```

2. Open the dashboard UI.
3. Confirm a **GitHub Sync** tab is visible.
4. Open the tab and confirm the **GitHub Repository Configuration** card is present.

If auth is unavailable or user is not signed in, expect a sign-in/auth warning banner and disabled actions.

#### 2) Test connection flow

1. In **GitHub Sync** tab, enter:
   - `owner`
   - `repo`
   - optional `branch`
2. Click **Test Connection**.

Expected states:

- **Loading:** button shows `Testing...` with spinner.
- **Success:** toast shows "Connection Successful" and target repo.
- **Failure:** destructive toast and inline red error message block with failure reason.

#### 3) Test configuration + bulk sync flow

1. Click **Save Configuration**.
2. Confirm connected status appears (`Connected to owner/repo ...`).
3. In **Initial Sync**, click **Sync All Sessions to GitHub**.

Expected states:

- **Loading:** button shows `Syncing...` with spinner.
- **Success:** toast "Bulk Sync Complete", then success card `GitHub Sync Active` appears once migration is done.
- **Failure:** destructive toast with sync error details.

## Verification

### Operator/developer preflight checks

Run these checks before manual UI validation to confirm plugin loading and contract compliance:

```bash
npm test -- plugins/github-sync/plugin.test.ts
npm test -- plugins/github-sync/src/index.test.ts
npm test -- src/lib/plugins/validate.test.ts
npm test -- src/tests/api-plugins-routes.test.ts
npm test -- src/tests/api-plugins-discovered-dashboard-tabs-route.test.ts
```

### Testing checklist

Use this checklist for plugin changes:

- [ ] Manifest still validates and includes expected dashboard extension ids.
- [ ] Plugin bootstrap still registers extension id + component id.
- [ ] GitHub tab appears in discovered dashboard tabs.
- [ ] Auth-gated behavior is intact (signed-out and auth-unavailable states).
- [ ] Validate and sync endpoints handle missing/invalid inputs.
- [ ] Success/failure UI states for test/sync are visible and actionable.

### UX criteria to automated tests

- **Loading state present** → `src/components/github-settings.ux.test.tsx`
  - `loading criterion anchor: loading state present with loading text and disabled interaction while loading`
- **Error state with recovery** → `src/components/github-settings.ux.test.tsx`
  - `error criterion anchor: error state exposes retry recovery action label and callable recover flow`
- **Empty state with CTA** → `src/components/github-settings.ux.test.tsx`
  - `empty criterion anchor: empty state present with cta action wording run sync configure`
- **Destructive action safety (confirm + cancel)** → `src/components/github-settings.destructive.test.tsx`
  - `destructive criterion anchor: destructive confirm clears configuration and destructive cancel preserves prior values`

### Exact test commands

Current targeted checks that cover plugin integration points:

```bash
node --import tsx --test src/tests/api-plugins-discovered-dashboard-tabs-route.test.ts
node --import tsx --test src/lib/navigation/tab-definitions.test.ts
node --import tsx --test src/lib/plugins/validate.test.ts
```

When plugin-specific suites are added, use these exact command patterns:

```bash
node --import tsx --test plugins/github-sync/plugin.test.ts plugins/github-sync/src/index.test.ts plugins/github-sync/src/index.behavior.test.ts
node --import tsx --test src/components/github-settings.test.tsx
```

If you add an npm script later, keep parity with:

```bash
npm run test -- plugins/github-sync/plugin.test.ts plugins/github-sync/src/index.test.ts plugins/github-sync/src/index.behavior.test.ts src/components/github-settings.test.tsx
```

## Troubleshooting

### Missing token (`GITHUB_TOKEN`)

Symptoms:

- Validation/sync requests fail immediately with message indicating token is not configured.

Fix:

- Set `GITHUB_TOKEN` in the runtime environment.
- Restart the server/process after updating environment variables.

### Auth unavailable

Symptoms:

- Warning banner indicates sign-in required or Firebase auth unavailable.
- Inputs/actions are disabled.

Fix:

- Ensure Firebase client and admin configuration are present.
- Sign in with a supported provider/account.

### Invalid repository settings

Symptoms:

- Connection test fails with repo/branch not found or forbidden/unauthorized message.

Fix:

- Verify `owner`, `repo`, and optional `branch` are correct.
- Ensure token has access to private repos if applicable.
- Ensure requested repo matches user-configured repo where authorization checks enforce it.
