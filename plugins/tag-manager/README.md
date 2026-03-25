# Tag Manager Plugin

## Purpose and capabilities

The Tag Manager plugin provides a **dashboard tab** for global technique-tag maintenance across logged sessions.

- **Primary capability:** `tag_mutation`
- **Dashboard tab extension metadata:**
  - extension type: `dashboard_tab`
  - extension id: `tag-manager-dashboard-tab`
  - tab id: `tag-manager`
  - tab title: `Tag Manager`
  - header title: `Manage Tags`
  - icon: `tags`
  - component id: `tag_manager`

This metadata is declared in `plugins/tag-manager/plugin.json` and must stay aligned with runtime registration in `plugins/tag-manager/src/index.ts`.

## Usage

### Operator/developer quickstart

1. Verify plugin manifest/runtime alignment:
   - `plugins/tag-manager/plugin.json` declares component `tag_manager`
   - `plugins/tag-manager/src/index.ts` registers `tag_manager`
2. Start the application:

   ```bash
   npm run dev
   ```

3. Open **Dashboard → Plugins** and ensure Tag Manager is enabled.
4. Open **Dashboard → Tag Manager** and execute rename/merge/delete flows.

### Enablement and discovery flow

1. **Manifest discovery**
   - The plugin manifest is loaded from `plugins/tag-manager/plugin.json`.
   - The plugin is considered installed when discovered by plugin APIs.

2. **Enablement**
   - The plugin can be toggled in the Plugins UI (Installed Plugins list).
   - When enabled, the dashboard extension may render if capability and component checks pass.

3. **Runtime component registration**
   - `plugins/tag-manager/src/index.ts` registers:
     - extension id `tag-manager-dashboard-tab`
     - component renderer id `tag_manager`
   - The renderer mounts `TagManager` from `src/components/tag-manager.tsx`.

4. **UI appearance**
   - After successful discovery + enablement + renderer resolution, users see a **Tag Manager** tab in the dashboard navigation.

## Verification

### Operator/developer preflight checks

Run these checks before manual validation to confirm discovery and contract-gate integrity:

```bash
npm test -- src/lib/plugins/plugin-contract-gate.test.ts
npm test -- src/tests/api-plugins-routes.test.ts
npm test -- src/tests/api-plugins-discovered-dashboard-tabs-route.test.ts
```

Use seeded session data that contains at least two tags with overlap opportunities.

1. Open the dashboard and select the **Tag Manager** tab.
   - Confirm the technique list appears.
   - Confirm search filters the list.

2. **Rename flow** (Analyze -> Apply)
   - Click edit on a tag.
   - Enter a new tag name.
   - Click **Analyze** and verify impact counts appear in the dialog.
   - Click **Apply**.
   - Expected: success toast indicating rename impact (sessions + tag changes).

3. **Merge flow** (Analyze -> Apply)
   - Click merge on a source tag.
   - Select a target technique.
   - Click **Analyze** and verify impact counts appear.
   - Click **Apply**.
   - Expected: success toast indicating merge impact.
   - Expected destructive warning context: merge dialog includes a heads-up alert that source tag is replaced globally.

4. **Delete flow** (Analyze -> Apply)
   - Click delete on a tag.
   - Click **Analyze** and verify impact counts appear.
   - Click **Apply**.
   - Expected: success toast indicating delete impact.
   - Expected destructive confirmation context: destructive-styled delete dialog/title and destructive apply action.

## Troubleshooting

### Warning: unresolved component renderer

Symptom:
- Dashboard tab does not render, and plugin runtime warns that a dashboard component is not registered.

Checks:
1. In `plugins/tag-manager/plugin.json`, verify `uiExtensions[].config.component` is `tag_manager`.
2. In `plugins/tag-manager/src/index.ts`, verify `registerPluginComponent('tag_manager', ...)` is present.
3. Ensure plugin initialization executes (i.e., plugin module is included in build/runtime path).

### Warning: capability mismatch

Symptom:
- Plugin extension is discovered but not rendered due to missing capability warning.

Checks:
1. In `plugins/tag-manager/plugin.json`, verify `capabilities` includes `tag_mutation`.
2. Ensure no typo/case mismatch in capability string.
3. Re-enable plugin after manifest updates to refresh discovery/runtime state.

## Reference paths

- `plugins/tag-manager/plugin.json`
- `plugins/tag-manager/src/index.ts`
- `src/components/tag-manager.tsx`
