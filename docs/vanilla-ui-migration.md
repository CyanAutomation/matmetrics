# Vanilla UI Migration

MatMetrics is moving interactive UI incrementally within the existing application. The existing routes, API endpoints and dashboard remain the integration points during migration.

## Component lifecycle

Reusable vanilla components live in `src/vanilla/`. A component exposes an HTML-rendering function and, when interactive, a mount function returning the `ComponentController<Props>` defined in `component.ts`:

- Render markup from explicit props, escaping untrusted text and attributes.
- Mount event listeners on the supplied root and read the latest props when events fire.
- Update changed properties without replacing focused controls unnecessarily.
- Remove every listener and other owned resource in `destroy`; the caller owns the host element.

Components must work without React. While a parent is still React-owned, a temporary adapter renders the same markup, mounts the controller, forwards updates and destroys it on unmount. The adapter disappears when its parent is converted. Component tests cover rendering, interaction, updates and cleanup; adapter tests cover integration and React Strict Mode where relevant.

## Current conversion slice

The training-history filter bar, grouped results, and review results panel render through vanilla components inside the existing React-owned history screen. The grouped results and review panel compose shared session-row, `Surface`, and button primitives. Edit and delete dialogs use the shared native dialog and confirmation components; the edit form remains React content inside the vanilla dialog shell.

The session essentials reuse vanilla text and select fields plus a native radio group for effort selection. Practice notes use a shared vanilla textarea, and technique tags use a reusable tag editor with native entry, add, and remove controls. A framework-neutral session-form controller now owns field values, and a submit controller owns URL validation, pending/error state, and save/update orchestration; React subscribes to both through temporary adapters. AI actions and the form composition remain React-owned. Training-history filter values, semantic search, and session-review orchestration also live in framework-neutral controllers; React subscribes to their snapshots while the history composition remains React-owned. These slices keep the current routes and API integration in place.

The edit and delete dialog targets now live in a framework-neutral controller; the history screen subscribes to it through the same temporary React boundary. Delete persistence and toast behavior still use the existing action hook. The session form's step indicator is also a reusable vanilla component with standalone CSS, hosted by a temporary React adapter while the form shell remains React-owned.

The training-history empty state uses a reusable vanilla empty-state component for its illustration, copy, and primary action. The component escapes text and attributes, restricts illustrations to same-origin paths, preserves keyboard focus when updated, and removes its delegated event listener when destroyed. Its temporary React adapter keeps the current page composition in place while the rest of the history view is migrated.

Framework-neutral state controllers expose stable `getSnapshot` and `subscribe` functions so either a vanilla parent or a temporary React `useSyncExternalStore` adapter can consume them. The training-history filter controller owns query, category, effort, date, quick-filter, filter-panel, and density state. A separate semantic-search controller owns request validation, abort handling, loading state, and fallback errors. The review controller owns batch progress and reviewed-session state; all three keep the existing API paths and contracts.

## Migration order

1. Convert reusable controls, empty states, dialogs, and individual history interactions in the existing view.
2. Move remaining history delete persistence/toast behavior and session-form AI enhancements behind framework-neutral controllers, preserving session storage, search, and accessibility behavior.
3. Define a vanilla plugin mount/update/destroy contract and a compatibility adapter for existing React plugins. Migrate plugin validation and each plugin before retiring the adapter.
4. Migrate the dashboard shell, authentication and remaining views, then remove unused React UI dependencies.

The server and its Next.js API routes remain in place during this work. Removing Next.js would require a separate server and deployment migration, including authentication rewrites and content security policy handling.

Each conversion must preserve keyboard access, focus, responsive and theme behavior, loading and error states, and existing data contracts. Use existing design tokens in vanilla CSS and verify user-facing flows before replacing their previous implementation.
