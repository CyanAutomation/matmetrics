# Vanilla UI Feasibility Assessment

**Baseline:** `origin/main` at `2f86736e7e82974ab503a2f9509e34ecd39a4143` (2026-11-08).

## Decision

Moving the browser UI to vanilla TypeScript, HTML, and CSS is feasible as a staged migration. The repository already has a vanilla component lifecycle, early converted controls, and a migration sequence in [Vanilla UI Migration](vanilla-ui-migration.md). Session and API contracts can remain intact while views are converted.

The scope depends on what “vanilla” means:

| Target | Feasibility | Relative scope |
| --- | --- | --- |
| Write UI behavior in vanilla modules while retaining the current Next.js app and API | Feasible; this matches the existing migration approach | Large, incremental UI project |
| Remove React from the browser UI while retaining the current Next.js API service | Feasible by replacing the response for the existing page path with HTML and a bundled vanilla client after component conversion | Large, with a final page-boundary change |
| Remove Next.js as well as React | Feasible as a separate initiative | Very large; includes server, auth routing, security headers, and deployment work |

Next.js App Router pages are React-rendered, so a fully React-free interface cannot remain an ordinary `page.tsx` app. A later React-free UI can reuse the existing page path with an HTML response and bundled TypeScript client while Next.js continues to host the APIs. The incremental conversion keeps the current page and URL in place; it does not add a parallel UI route. Removing Next.js itself is a separate server and deployment migration. A vanilla TypeScript UI also needs a client build step; browsers do not execute TypeScript source directly.

## Current baseline

- At this baseline, `src/vanilla/` has 27 non-test TypeScript modules and 25 component stylesheets. Temporary React adapters let vanilla controls render inside React-owned views. The shared controller contract covers update and cleanup, and the HTML helper escapes text and attributes in [component.ts](../src/vanilla/component.ts#L1-L12).
- `src/app/` and `src/components/` contain 104 production TSX files, including 33 UI primitive files in `src/components/ui/`. The main page is a client component that coordinates authentication, preferences, session data, navigation, dialogs, and plugins ([page.tsx](../src/app/page.tsx#L1-L25), [page.tsx](../src/app/page.tsx#L30-L90)).
- Authentication is shared state, not just screen markup: the provider observes Better Auth sessions and exposes passkey, email, reset, and sign-out operations ([auth-provider.tsx](../src/components/auth-provider.tsx#L97-L119), [auth-provider.tsx](../src/components/auth-provider.tsx#L227-L302)).
- All six first-party dashboard plugins register React renderers. Replacing React UI therefore requires a new plugin mount/update/destroy contract, plus a compatibility period or coordinated conversion ([plugin-component-registry.ts](../src/lib/plugins/plugin-component-registry.ts#L1-L27)).
- The fetched `main` already converts the session-history row, filter bar, and several controls to vanilla modules and controllers, with temporary React adapters. History state, review panel, dialogs, and surrounding composition remain React-owned.

## Implementation progress

The fetched `main` already converts grouped session results, history dialogs, and review results into vanilla components inside the existing React-owned history screen. This implementation worktree adds reusable native radio-group, textarea, and tag-editor components, extends the shared text field for date and numeric inputs, and uses them in the existing session form. The form still owns state and submission in React through temporary adapters. The worktree now has 30 non-test TypeScript modules in `src/vanilla/` and 28 component stylesheets. These conversions add no route or API endpoint.

## Recommended path

Keep the existing API routes, Workers, session data shape, and storage behavior stable while converting the client in layers:

1. Continue with shared controls and history interactions, keeping the current routes and temporary adapters at React-owned boundaries.
2. Move history state, review behavior, dialogs, filtering, and session-form flows into vanilla controllers. Preserve focus, keyboard behavior, loading/error states, and existing API contracts.
3. Define and document the vanilla plugin lifecycle, then convert the six first-party plugins and their validation before retiring React plugin adapters.
4. Convert the dashboard shell and auth flows through the existing page route and host. Keep the current route and API integration as the migration proceeds.
5. Review React and Next.js runtime removal as a separate decision after the UI has moved; avoid introducing a parallel UI route or server during the incremental conversion.

This sequence follows the current migration guide and avoids coupling UI conversion to changes in session storage or Go/TypeScript contracts.

## Main risks and constraints

- **Stateful behavior:** The dashboard and session forms coordinate many asynchronous operations. Moving state out of hooks requires explicit controller ownership, cancellation/cleanup, and update rules.
- **Accessibility and browser behavior:** Radix currently supplies behavior for dialogs, menus, selects, switches, tooltips, and other controls. Native replacements must preserve keyboard support, focus handling, and announcements rather than just their appearance.
- **Rendering safety:** Vanilla template strings need consistent escaping and safe URL/attribute handling. Updates must avoid replacing focused inputs and must remove listeners and other resources on teardown.
- **Styling conversion:** The app uses Tailwind utilities and shared design tokens. Moving to ordinary CSS requires translating utility-heavy markup and keeping dark mode, responsive layouts, and token parity.
- **Authentication and origin routing:** If Next.js is removed, its same-origin rewrite to the Auth Worker, per-request CSP nonce, security headers, Sentry setup, and traced plugin files need replacements. These are visible in [next.config.ts](../next.config.ts#L11-L59) and [proxy.ts](../src/proxy.ts#L1-L20). API handlers also currently use Next request/response types.
- **Verification load:** Existing UI tests include React rendering and adapter behavior. Each converted flow needs DOM-level interaction and cleanup coverage, followed by end-to-end checks for auth, sessions, plugins, and responsive behavior.

## Conclusion

Proceed with the UI migration in the existing application. The current history results slice demonstrates that reusable vanilla components can replace React-rendered subtrees while the page, routes, and APIs remain stable. The next milestone is to move history state and dialogs into vanilla controllers, then define the plugin lifecycle before converting the dashboard shell. Decide on React and Next.js runtime removal separately after the browser UI has migrated.
