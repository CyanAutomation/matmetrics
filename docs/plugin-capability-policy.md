# Plugin Capability Policy

This document is the authoritative policy for which plugin UI extension
surfaces require explicit manifest capabilities.

## Extension Type Capability Requirements

- `dashboard_tab` with `config.component: "tag_manager"` requires
  `tag_mutation`.
- `session_action` with `config.actionId: "tag-session"` requires
  `tag_mutation`.
- `settings_panel` with `config.component: "tag_settings"` requires
  `tag_mutation`.

Any change to these policy rules must be reflected in:

1. `src/lib/plugins/capabilities.ts` capability mapping logic.
2. `src/lib/plugins/capabilities.test.ts` policy regression tests.

## First-Party Plugin Test Baseline

Each first-party plugin under `plugins/<id>/` must include two minimum tests:

1. `plugins/<id>/plugin.test.ts`
   - Validates the manifest via `validatePluginManifest(...)`.
   - Asserts the plugin `id`, dashboard tab extension `id`, dashboard `tabId`,
     and dashboard extension `config.component`.
2. `plugins/<id>/src/index.test.ts`
   - Calls `initPlugin(...)` with stubbed `register` and
     `registerPluginComponent` handlers.
   - Asserts registration runs exactly once for the expected extension id and
     component id.

This baseline is the minimum maturity evidence for plugin-local test coverage;
additional behavior and UX-state tests are encouraged for Silver/Gold maturity.
