# Prompt Settings Plugin

## Purpose and Scope

- UI contract baseline: [docs/plugin-ui-contract.md](../../docs/plugin-ui-contract.md).

The `prompt-settings` plugin adds a dedicated **Prompt Settings** dashboard tab where users can manage the AI transformation instructions used when polishing session notes.

- **Plugin scope**: per-user prompt customization for the AI transform workflow.
- **Dashboard contribution**: one `dashboard_tab` extension titled **Prompt Settings** (`tabId: prompt-settings`).

## Manifest and Runtime Wiring

### Manifest (`plugin.json`)

The plugin manifest defines the dashboard tab extension and metadata:

- Plugin id: `prompt-settings`
- Extension id: `prompt-settings-dashboard-tab`
- Extension type: `dashboard_tab`
- Tab title: `Prompt Settings`
- Component id: `prompt_settings`

This component id is what the runtime uses to resolve the UI renderer.

### Runtime bootstrap (`src/index.ts`)

At runtime, `initPlugin` wires the plugin into the dashboard extension system by:

1. Registering the extension id `prompt-settings-dashboard-tab`.
2. Registering the component renderer for `prompt_settings`.
3. Rendering the `PromptSettings` React component for that component id.

## UI Ownership

- Canonical model: plugin-local feature UI lives under `plugins/<plugin>/src/components`.
- This plugin owns `plugins/prompt-settings/src/components/prompt-settings.tsx` and its colocated tests.
- Shared cross-plugin primitives remain in `src/components/plugins` (for example `PluginPageShell`, `PluginLoadingState`, and `PluginConfirmationDialog`).
- `plugins/<plugin>/src/index.ts` must import feature renderers from `./components/*` (never from `@/components/*` plugin feature files).

## Usage

### Operator/developer quickstart

1. Confirm plugin assets are present:
   - `plugins/prompt-settings/plugin.json`
   - `plugins/prompt-settings/src/index.ts`
2. Start the local app:

   ```bash
   npm run dev
   ```

3. Sign in, then open **Dashboard → Prompt Settings**.
4. Validate Save and Reset behavior against the expected outcomes below.

### User workflow

1. Open the Dashboard and select the **Prompt Settings** tab.
2. Edit the **System Instructions** text area.
3. Click **Save Prompt** to persist changes for the signed-in user.
4. Click **Reset to Default** to restore default Kodokan prompt instructions.

Behavioral expectations:

- If auth is not available or user is signed out, controls are disabled and a sign-in/configuration alert is shown.
- Save shows a success toast (`Prompt updated`) and a temporary `Saved!` indicator.
- Reset shows a success toast indicating default prompt restoration.

## Verification

### Operator/developer preflight checks

Run these checks to validate plugin registration and API/plugin contract behavior:

```bash
npm test -- plugins/prompt-settings/plugin.test.ts
npm test -- plugins/prompt-settings/src/index.test.ts
npm test -- src/lib/plugins/plugin-contract-gate.test.ts
npm test -- src/lib/plugins/load-dashboard-tab-extensions.test.ts
npm test -- src/tests/api-plugins-routes.test.ts
```

### Static checks

Run project-wide checks:

```bash
npm run lint
npm run typecheck
```

### Relevant automated tests

Run plugin-focused and integration coverage that exercises plugin discovery/render wiring:

```bash
npm test -- plugins/prompt-settings/src/components/prompt-settings.test.tsx
npm test -- src/lib/plugins/load-dashboard-tab-extensions.test.ts
npm test -- src/tests/api-plugins-discovered-dashboard-tabs-route.test.ts
npm test -- src/lib/navigation/tab-definitions.test.ts
```

If you add dedicated tests for this plugin, include them in this section (for example: `plugins/prompt-settings/**/*.test.ts` or `plugins/prompt-settings/src/components/prompt-settings.test.tsx`).

### UX criteria to automated tests

- **Loading state present** → `plugins/prompt-settings/src/components/prompt-settings.test.tsx`
  - `loading criterion anchor: loading state present with loading text and disabled interaction while loading`
  - `loading criterion anchor: loading disables interaction when save or reset is in progress`
- **Error state with recovery** → `plugins/prompt-settings/src/components/prompt-settings.test.tsx`
  - `error criterion anchor: error state exposes retry recovery action label and callable recover flow`
  - `error criterion anchor: error recovery handles retry failure without throwing`
- **Empty/default state with CTA** → `plugins/prompt-settings/src/components/prompt-settings.test.tsx`
  - `empty criterion anchor: empty/default state includes explicit cta action wording add create configure`
- **Destructive reset safety (confirm + cancel)** → `plugins/prompt-settings/src/components/prompt-settings.test.tsx`
  - `destructive criterion anchor: destructive confirm resets prompt and destructive cancel preserves prompt text`

### Manual verification checklist

Because this feature is auth- and backend-dependent, verify in a running app (`npm run dev`) with realistic sign-in state:

1. **Sign-in required state**
   - Sign out (or disable auth config) and open Prompt Settings.
   - Confirm alert text appears and Save/Reset controls are disabled.
2. **Save success path**
   - Sign in.
   - Update prompt text and click **Save Prompt**.
   - Confirm success toast and temporary `Saved!` button state.
   - Reload app and confirm saved prompt persists.
3. **Save/Reset failure handling**
   - Simulate backend write failure (e.g., unavailable Firestore rules/network failure in dev tools or emulator).
   - Confirm error handling is surfaced (toast/logs/UI behavior) and app remains usable.
4. **Reset confirmation**
   - With a customized prompt, click **Reset to Default**.
   - Confirm toast is shown and prompt value returns to default on reload.

## Known Limitations and Dependencies

- **Authentication dependency**: prompt persistence requires a signed-in user; without auth, prompt settings are read-only/unavailable.
- **Preferences backend dependency**: save/reset depend on user-preferences persistence (`saveTransformerPromptPreference`, `resetTransformerPromptPreference`) and backing Firebase/Firestore availability.
- **Operational caveat**: manual failure-path testing currently requires environment simulation (auth disabled, network or backend faults) rather than a dedicated in-app fault injector.
