# Vanilla UI Migration

MatMetrics is moving interactive UI incrementally within the existing application. The existing routes, API endpoints and dashboard remain the integration points during migration.

## Component lifecycle

Reusable vanilla components live in `src/vanilla/`. A component exposes an HTML-rendering function and, when interactive, a mount function returning the `ComponentController<Props>` defined in `component.ts`:

- Render markup from explicit props, escaping untrusted text and attributes.
- Mount event listeners on the supplied root and read the latest props when events fire.
- Update changed properties without replacing focused controls unnecessarily.
- Remove every listener and other owned resource in `destroy`; the caller owns the host element.

Components must work without React. While a parent is still React-owned, a temporary adapter renders the same markup, mounts the controller, forwards updates and destroys it on unmount. The adapter disappears when its parent is converted. Component tests cover rendering, interaction, updates and cleanup; adapter tests cover integration and React Strict Mode where relevant.

## Migration order

1. Convert reusable controls and complete individual history interactions in the existing view.
2. Move history state and its remaining presentation behind a vanilla controller, preserving session storage, search, dialogs and accessibility behavior.
3. Define a vanilla plugin mount/update/destroy contract and a compatibility adapter for existing React plugins. Migrate plugin validation and each plugin before retiring the adapter.
4. Migrate the dashboard shell, authentication and remaining views, then remove unused React UI dependencies.

The server and its Next.js API routes remain in place during this work. Removing Next.js would require a separate server and deployment migration, including authentication rewrites and content security policy handling.

Each conversion must preserve keyboard access, focus, responsive and theme behavior, loading and error states, and existing data contracts. Use existing design tokens in vanilla CSS and verify user-facing flows before replacing their previous implementation.
