# Plugin UI Contract

This document defines the baseline UI contract for first-party and third-party dashboard plugins.

## Required shell usage

- Dashboard tab plugins **must** render inside `PluginPageShell` to preserve shared spacing, heading rhythm, and responsive container behavior.
- Sectioned content should use `PluginSectionCard` for consistent card framing and descriptive copy.
- Global notices that gate access (auth/config/environment) should use `PluginAuthGateNotice` and/or `PluginNotice`.

## Spacing and section hierarchy

- Use a single page title and one lead description at the shell level.
- Group content into clear, task-oriented sections in this order whenever applicable:
  1. Access/health notices
  2. Primary controls or filters
  3. Results/data presentation
  4. Secondary maintenance actions
- Use plugin shell/container spacing utilities rather than ad-hoc per-plugin wrapper margins.

## Standard state components

Use shared state primitives instead of custom one-off state fragments where possible:

- Loading state: `PluginLoadingState`
- Error state with recovery action: `PluginErrorState`
- Empty state with CTA: `PluginEmptyState`
- Positive completion feedback: `PluginSuccessState`
- Destructive confirmation: `PluginConfirmationDialog` and/or `PluginDestructiveAction`

If a plugin manifest declares required UX states in `uiContract.requiredUxStates`, plugin UI should include matching standard helpers in its render flow.

## `uiContract.designTokenVariants` mapping requirements

Dashboard tabs must declare `uiContract.designTokenVariants` and ensure each declared variant maps to concrete shared classes/tokens used by the rendered UI.

- Runtime now emits a `dashboard_tab_design_token_variants_missing` warning when the field is absent or empty.
- Variants should map to classes from the centralized style policy (`src/components/plugins/plugin-style-policy.ts`) rather than ad-hoc palette utilities.

Current required mappings:

- `layout.standard` → plugin surface uses the standard shell width token (`max-w-4xl`).
- `layout.wide` → plugin surface uses the wide shell width token (`max-w-6xl`).
- `surface.githubSync` → use shared plugin info/surface tokens (for example `bg-primary/5`, `border-primary/25`).
- `surface.promptSettings` → use shared card/surface tokens (for example `bg-card/95`, `border-primary/20`).
- `surface.tagManager` → use shared tag-manager tokens (for example `bg-card/95`, `bg-primary`).
- `surface.videoLibrary` → use shared video-library typography/surface tokens (for example `bg-card/95`, `text-muted-foreground`).
- `surface.logDoctor` → use shared diagnostics surface tokens (for example `bg-secondary/20`, `border-ghost`).

When adding a new `designTokenVariants` value:

1. Add/update the variant entry in `src/components/plugins/plugin-style-policy.ts`.
2. Update plugin UI to consume only mapped shared tokens/utilities.
3. Update plugin tests (including `plugins/plugin-ui-color-classes.test.ts`) if scan coverage changes.

## Destructive flow requirements

For destructive actions (delete/reset/clear/replace):

- Require an explicit confirmation step (dialog or destructive action helper).
- Include both a **confirm** and **cancel** path.
- Keep confirm labels action-specific (for example, "Remove domain" or "Yes, reset prompt").
- Disable destructive controls while the action is pending and provide visible pending text.
- Surface post-action feedback with success or error messaging.

## Accessibility baseline for plugin controls

- Every input/select/textarea must have an associated visible label.
- Icon-only controls must include accessible names (`aria-label`).
- Loading and error content must be perceivable in text (not icon-only).
- Dialogs must include clear titles/descriptions and keyboard-accessible cancel actions.
- Disabled states must be programmatic (`disabled`, `aria-disabled`) and visually apparent.
- Color must not be the only channel for status meaning; pair with iconography or text labels.

## Required CI gates

Plugin UI contract compliance is enforced at build/lint time.

- Run `npm run validate:plugin-ui-contract` to statically validate each dashboard plugin component declared in `plugins/*/plugin.json`.
- `npm run lint` now runs this validator before ESLint, so contract violations block CI and merges.
- Validation failure output includes the plugin id, missing requirement, and source file path to fix.

## Migration checklist for new plugins

When adding a plugin dashboard tab:

1. Declare each dashboard component id in `plugin.json` under `uiExtensions[].config.component`.
2. Register the same component id in `plugins/<plugin>/src/index.ts` via `registerPluginComponent` with a concrete `React.createElement(Component)` target.
3. Ensure the rendered UI tree uses shared shell/section primitives (`PluginPageShell` and, where applicable, `PluginSectionCard`).
4. Implement every state helper required by `uiContract.requiredUxStates`:
   - `loading` → `PluginLoadingState`
   - `error` → `PluginErrorState`
   - `empty` → `PluginEmptyState`
   - `success` → `PluginSuccessState`
   - `destructive` → `PluginConfirmationDialog`, `PluginDestructiveAction`, or `usePluginConfirmation`
5. Run `npm run validate:plugin-ui-contract` locally before opening a PR.
