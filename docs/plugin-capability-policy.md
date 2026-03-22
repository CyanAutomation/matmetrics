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
