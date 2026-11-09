# Vanilla UI Feasibility Assessment

**Baseline:** fetched `origin/main` at `f8ea1f4dca3203212327d6d4f10f33a2042886a4` (2026-11-09).

## Decision

Moving the browser UI to vanilla TypeScript, HTML, and CSS is feasible as a staged migration. The repository already has a vanilla component lifecycle, early converted controls, and a migration sequence in [Vanilla UI Migration](vanilla-ui-migration.md). Session and API contracts can remain intact while views are converted.

The scope depends on what “vanilla” means:

| Target | Feasibility | Relative scope |
| --- | --- | --- |
| Write UI behavior in vanilla modules while retaining the current Next.js app and API | Feasible; this matches the existing migration approach | Large, incremental UI project |
| Remove React from the browser UI while retaining the current Next.js API service | Feasible after converting all browser views and replacing the React page boundary with HTML and a bundled vanilla client | Large, with a final page-boundary change |
| Remove Next.js as well as React | Feasible as a separate initiative | Very large; includes server, auth routing, security headers, and deployment work |

Next.js App Router pages are React-rendered, so a fully React-free interface cannot remain an ordinary `page.tsx` app. A later React-free UI can reuse the existing page path with an HTML response and bundled TypeScript client while Next.js continues to host the APIs. The incremental conversion keeps the current page and URL in place; it does not add a parallel UI route. Removing Next.js itself is a separate server and deployment migration. A vanilla TypeScript UI also needs a client build step; browsers do not execute TypeScript source directly.

## Current baseline

- `src/vanilla/` has 34 production TypeScript modules and 29 component stylesheets. Temporary React adapters let these modules render inside React-owned views. The shared controller contract covers update and cleanup, and the HTML helper escapes text and attributes in [component.ts](../src/vanilla/component.ts#L1-L12).
- `src/` and `plugins/` contain 137 production TSX files, including 33 React UI primitives in `src/components/ui/`. The main page coordinates authentication, preferences, session data, navigation, dialogs, and plugins ([page.tsx](../src/app/page.tsx#L1-L25), [page.tsx](../src/app/page.tsx#L30-L90)).
- Authentication is shared state, not just screen markup: the provider observes Better Auth sessions and exposes passkey, email, reset, and sign-out operations ([auth-provider.tsx](../src/components/auth-provider.tsx#L97-L119), [auth-provider.tsx](../src/components/auth-provider.tsx#L227-L302)).
- All six first-party dashboard plugins register React renderers. Replacing React UI therefore requires a new plugin mount/update/destroy contract, plus a compatibility period or coordinated conversion ([plugin-component-registry.ts](../src/lib/plugins/plugin-component-registry.ts#L1-L27)). The current plugin contract explicitly requires a concrete `React.createElement` target ([plugin-ui-contract.md](plugin-ui-contract.md#L88-L101)).
- The ordinary browser routes are still React pages wrapped by a React root layout and providers. The reset-password view and error boundaries also need conversion before the browser UI is fully React-free ([layout.tsx](../src/app/layout.tsx#L22-L35), [reset-password/page.tsx](../src/app/reset-password/page.tsx#L1-L15)).

## Implementation progress

The fetched `main` already renders the history row, filter bar, grouped results, review panel, and dialog shells with vanilla components inside React-owned views. The session form reuses vanilla text/select/radio controls, textarea, and tag editor. History filtering, semantic search, and review orchestration use framework-neutral controllers; React still subscribes to them, owns history edit/delete state and composition, and owns the form state, AI actions, and submission. The conversion so far keeps the existing routes and API contracts in place ([Vanilla UI Migration](vanilla-ui-migration.md#L16-L24)).

This assessment worktree moves edit/delete dialog selection, session-form field values, and save/update orchestration into framework-neutral controllers, then adds a reusable vanilla step-progress component and stylesheet. React subscribes through temporary adapters, so these changes add no route or API endpoint.

## Recommended path

Keep the existing API routes, Workers, session data shape, and storage behavior stable while converting the client in layers:

1. Finish moving history delete persistence/toast behavior and session-form AI enhancements behind vanilla controllers while retaining the existing routes and API contracts.
2. Replace the remaining dashboard, preference, session-list, theme, toast, and authentication React providers/hooks with framework-neutral stores and controllers. Preserve cancellation and cleanup when users or views change.
3. Define and document a vanilla plugin mount/update/destroy contract, add a compatibility period, then convert the six first-party plugins and update their React-specific validation.
4. Convert the dashboard shell, reset-password screen, and error states, then replace the React page boundary with HTML and a compiled TypeScript client if removing React from the browser is a goal.
5. Decide separately whether Next.js remains the API host. Removing it also requires a new server/runtime and replacements for auth rewrites, CSP/security headers, and deployment integration.

This sequence follows the current migration guide and avoids coupling UI conversion to changes in session storage or Go/TypeScript contracts.

## Main risks and constraints

- **Stateful behavior:** The dashboard and session forms coordinate many asynchronous operations. Moving state out of hooks requires explicit controller ownership, cancellation/cleanup, and update rules.
- **Accessibility and browser behavior:** Radix currently supplies behavior for dialogs, menus, selects, switches, tooltips, and other controls. Native replacements must preserve keyboard support, focus handling, and announcements rather than just their appearance.
- **Rendering safety:** Vanilla template strings need consistent escaping and safe URL/attribute handling. Updates must avoid replacing focused inputs and must remove listeners and other resources on teardown.
- **Styling conversion:** The app uses Tailwind utilities and shared design tokens. Moving to ordinary CSS requires translating utility-heavy markup and keeping dark mode, responsive layouts, and token parity.
- **Authentication and origin routing:** If Next.js is removed, its same-origin rewrite to the Auth Worker, per-request CSP nonce, security headers, Sentry setup, and traced plugin files need replacements. These are visible in [next.config.ts](../next.config.ts#L11-L59) and [proxy.ts](../src/proxy.ts#L1-L20). API handlers also currently use Next request/response types.
- **Verification load:** Existing UI tests include React rendering and adapter behavior. Each converted flow needs DOM-level interaction and cleanup coverage, followed by end-to-end checks for auth, sessions, plugins, and responsive behavior.

## Conclusion

Proceed with a staged UI migration. The current history and form slices show that vanilla components and controllers can replace React-rendered subtrees while preserving the existing URLs, API handlers, session contracts, and storage behavior. This is a large but practical UI project; the remaining stateful dashboard/auth flows and six React plugins are the main work. Removing React from the browser is feasible after the views and route boundaries are converted. Removing Next.js is a separate, substantially larger server and deployment project. Decide whether Tailwind remains part of the CSS toolchain, since removing utility classes would add a broad styling conversion to the UI work.
