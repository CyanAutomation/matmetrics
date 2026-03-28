# Log Doctor Plugin

## Purpose and capabilities

The Log Doctor plugin adds a **dashboard tab** for plugin-focused log diagnostics and future health checks.

- **Dashboard tab extension metadata:**
  - extension type: `dashboard_tab`
  - extension id: `log-doctor-dashboard-tab`
  - tab id: `log-doctor`
  - tab title: `Log Doctor`
  - header title: `Log Doctor`
  - icon: `stethoscope`
  - component id: `log_doctor`

This metadata is declared in `plugins/log-doctor/plugin.json` and must stay aligned with runtime registration in `plugins/log-doctor/src/index.ts`.

## Usage

1. Ensure the plugin is discoverable and enabled in Dashboard → Plugins.
2. Open Dashboard → Log Doctor.
3. Confirm the dashboard tab renders the plugin-owned Log Doctor placeholder UI.

## Verification

Run baseline checks:

```bash
npm test -- plugins/log-doctor/plugin.test.ts
npm test -- plugins/log-doctor/src/index.test.ts
npm test -- src/lib/plugins/plugin-contract-gate.test.ts
```

Manual verification:

1. Start the app with `npm run dev`.
2. Open Dashboard and verify the **Log Doctor** tab appears.
3. Open the tab and confirm the Log Doctor panel content renders.
