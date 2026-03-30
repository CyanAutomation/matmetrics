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
