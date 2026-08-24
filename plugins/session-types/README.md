# Session Types Plugin

## Purpose and capabilities

The Session Types plugin provides a **dashboard tab** for choosing which
session categories are available when logging training or creating a training
plan. **Technical** is required and always remains available; **Randori** and
**Shiai** can be enabled or disabled per account.

- **Dashboard tab extension metadata:**
  - extension type: `dashboard_tab`
  - extension id: `session-types-dashboard-tab`
  - tab id: `session-types`
  - tab title: `Session Types`
  - header title: `Session Types`
  - icon: `sliders`
  - component id: `session_types`

This metadata is declared in `plugins/session-types/plugin.json` and must stay
aligned with the runtime registration in `plugins/session-types/src/index.ts`.

## UI Ownership

- Plugin-local feature UI lives under `plugins/session-types/src/components`.
- This plugin owns
  `plugins/session-types/src/components/session-types.tsx` and its colocated
  tests.
- Shared cross-plugin primitives remain in `src/components/plugins`, including
  `PluginPageShell`, state components, and `PluginConfirmationDialog`.
- `plugins/session-types/src/index.ts` imports its feature renderer from
  `./components/*`; it must not import plugin feature UI from `@/components/*`.

## Usage

1. In **Dashboard → Plugins**, confirm that **Session Types Plugin** is
   enabled.
2. Open **Dashboard → Session Types**.
3. Toggle **Randori** or **Shiai** to control whether each option appears in
   new session logs and training plans.
4. When disabling a category, confirm the dialog. Existing session records are
   preserved.
5. Select **Save changes** to persist the selected categories to the signed-in
   account.

Technical cannot be disabled. If preferences cannot be loaded or saved, use
the retry action shown in the panel.

## Verification

Run the plugin contract and focused test checks:

```bash
npm run validate:plugin-ui-contract
npm test -- plugins/session-types/plugin.test.ts
npm test -- src/lib/plugins/plugin-contract-gate.test.ts
npm test -- src/tests/api-plugins-routes.test.ts
```

For manual verification, start the app with `npm run dev`, open
**Dashboard → Plugins**, and confirm that Session Types is enabled with no
contract issues. Then open **Dashboard → Session Types**, change a category,
confirm the destructive disable prompt, save, and reload to confirm the
selection persists.

## Reference paths

- `plugins/session-types/plugin.json`
- `plugins/session-types/src/index.ts`
- `plugins/session-types/src/components/session-types.tsx`
