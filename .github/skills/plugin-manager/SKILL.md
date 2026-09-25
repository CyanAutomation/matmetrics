---
name: plugin-manager
description: Create, update, list, or validate MatMetrics plugin manifests and plugin UI.
license: MIT
---

# Plugin Manager

Use this skill for plugin manifests, plugin UI registration, plugin status, or maturity reviews.

## Treat code as the contract

Before editing a manifest, inspect [manifest-schema.ts](../../../src/lib/plugins/manifest-schema.ts), [validate.ts](../../../src/lib/plugins/validate.ts), and a nearby working plugin. The schema and validator are authoritative; this skill intentionally does not duplicate the full manifest format.

Current known extension configuration requirements are:

| Extension      | Required configuration        |
| -------------- | ----------------------------- |
| dashboard_tab  | tabId, headerTitle, component |
| menu_item      | route, location               |
| session_action | actionId, component           |
| settings_panel | section, component            |

The complete TypeScript shapes are in [types.ts](../../../src/lib/plugins/types.ts). Unknown extension types produce a warning unless validation is explicitly called with experimental types enabled.

Dashboard components also follow the shared UI contract in [docs/plugin-ui-contract.md](../../../docs/plugin-ui-contract.md). It covers component registration, shared shell and state primitives, accessibility, and design-token mappings.

## Workflow

1. Inspect the requested plugin directory, manifest, entrypoint, tests, and any related scorecard before deciding whether to create or update.
2. For a new plugin, follow a current plugin’s directory and registration pattern. Register dashboard components with the existing plugin component registry; do not generate a generic initPlugin stub or invent route-based extension fields.
3. Keep the change limited to the user’s requested plugin behavior. Preserve existing manifest fields that are not part of the requested change.
4. Add or update tests for manifest validation, registration, or UI behavior that changed.
5. Run the checks relevant to the change:
   - npm run validate:plugin-ui-contract for dashboard composition and UI contract checks.
   - npm run test:all for the TypeScript suite.
   - npm run plugin:maturity:check when plugin maturity scorecards may be affected.

For list or review requests, inspect each plugins/*/plugin.json and its implementation rather than inferring enabled or maturity status from folder names. Report validation issues with plugin ID, manifest path, JSON path, and severity.

## References

- [Plugin manifest schema](../../../src/lib/plugins/manifest-schema.ts)
- [Manifest validation](../../../src/lib/plugins/validate.ts)
- [Plugin types](../../../src/lib/plugins/types.ts)
- [Plugin UI contract](../../../docs/plugin-ui-contract.md)
- [Plugin design principles](../../../docs/plugin-design-principles.md)
- [Plugin maturity scorecards](../../../docs/plugin-maturity-scorecards.json)
- [UI migration scorecards](../../../docs/plugin-ui-migration-scorecards.json)
- [Component registration example](../../../plugins/prompt-settings/src/index.ts)
