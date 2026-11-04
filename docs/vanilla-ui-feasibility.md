# Vanilla UI Feasibility Assessment

**Baseline:** `origin/main` at `96ae108f0bd5e3f0ac3e8503260f21023c950850` (2026-11-04).

## Decision

Moving the browser UI to vanilla TypeScript, HTML, and CSS is feasible as a staged migration. The repository already has a vanilla component lifecycle, early converted controls, and a migration sequence in [Vanilla UI Migration](vanilla-ui-migration.md). Session and API contracts can remain intact while views are converted.

The scope depends on what “vanilla” means:

| Target | Feasibility | Relative scope |
| --- | --- | --- |
| Write UI behavior in vanilla modules while retaining the current Next.js app and API | Feasible; this matches the existing migration approach | Large, incremental UI project |
| Remove React from the browser UI while retaining the current Next.js API service | Feasible, but the UI must be served outside Next.js App Router pages or through a separate static frontend | Large, with a hosting boundary change |
| Remove Next.js as well as React | Feasible as a separate initiative | Very large; includes server, auth routing, security headers, and deployment work |

Next.js App Router pages are React-rendered, so a fully React-free interface cannot remain an ordinary `page.tsx` app. Next.js can still host the APIs while the UI is served as HTML and bundled TypeScript from a route handler or a separate static frontend. Removing Next.js itself is a separate server and deployment migration. A vanilla TypeScript UI also needs a client build step; browsers do not execute TypeScript source directly.

## Current baseline

- `src/vanilla/` has 19 non-test TypeScript modules and 17 component stylesheets. Eight `vanilla-*` React adapters bridge vanilla controls into React-owned views. The shared controller contract covers update and cleanup, and the HTML helper escapes text and attributes in [component.ts](../src/vanilla/component.ts#L1-L12).
- `src/app/` and `src/components/` contain 102 production TSX files, including 33 UI primitive files in `src/components/ui/`. The main page is a client component that coordinates authentication, preferences, session data, navigation, dialogs, and plugins ([page.tsx](../src/app/page.tsx#L1-L25), [page.tsx](../src/app/page.tsx#L30-L90)).
- Authentication is shared state, not just screen markup: the provider observes Better Auth sessions and exposes passkey, email, reset, and sign-out operations ([auth-provider.tsx](../src/components/auth-provider.tsx#L97-L119), [auth-provider.tsx](../src/components/auth-provider.tsx#L227-L302)).
- All six first-party dashboard plugins register React renderers. Replacing React UI therefore requires a new plugin mount/update/destroy contract, plus a compatibility period or coordinated conversion ([plugin-component-registry.ts](../src/lib/plugins/plugin-component-registry.ts#L1-L27)).
- The latest `main` commit converted the full session-history row to a vanilla module and controller, with a temporary React adapter and tests. The history screen, filters, dialogs, and surrounding state are still React-owned.

## Recommended path

Keep the existing API routes, Workers, session data shape, and storage behavior stable while converting the client in layers:

1. Continue with shared controls and self-contained history interactions. Keep temporary adapters only at React-owned boundaries.
2. Move history state, dialogs, filtering, and session-form flows into vanilla controllers. Preserve focus, keyboard behavior, loading/error states, and existing API contracts.
3. Define and document the vanilla plugin lifecycle, then convert the six first-party plugins and their validation before retiring React plugin adapters.
4. Convert the dashboard shell and auth flows. Reassess UI delivery at this point: keep a thin React host if vanilla implementation is the goal, or replace the React page boundary with HTML and a bundled vanilla client if eliminating React from the browser is a firm requirement.
5. Only after the UI boundary is settled, decide whether Next.js remains the API host or is replaced in a separate server migration.

This sequence follows the current migration guide and avoids coupling UI conversion to changes in session storage or Go/TypeScript contracts.

## Main risks and constraints

- **Stateful behavior:** The dashboard and session forms coordinate many asynchronous operations. Moving state out of hooks requires explicit controller ownership, cancellation/cleanup, and update rules.
- **Accessibility and browser behavior:** Radix currently supplies behavior for dialogs, menus, selects, switches, tooltips, and other controls. Native replacements must preserve keyboard support, focus handling, and announcements rather than just their appearance.
- **Rendering safety:** Vanilla template strings need consistent escaping and safe URL/attribute handling. Updates must avoid replacing focused inputs and must remove listeners and other resources on teardown.
- **Styling conversion:** The app uses Tailwind utilities and shared design tokens. Moving to ordinary CSS requires translating utility-heavy markup and keeping dark mode, responsive layouts, and token parity.
- **Authentication and origin routing:** If Next.js is removed, its same-origin rewrite to the Auth Worker, per-request CSP nonce, security headers, Sentry setup, and traced plugin files need replacements. These are visible in [next.config.ts](../next.config.ts#L11-L59) and [proxy.ts](../src/proxy.ts#L1-L20). API handlers also currently use Next request/response types.
- **Verification load:** Existing UI tests include React rendering and adapter behavior. Each converted flow needs DOM-level interaction and cleanup coverage, followed by end-to-end checks for auth, sessions, plugins, and responsive behavior.

## Conclusion

Proceed with the UI migration, but define the target as two decisions: **vanilla UI implementation** and **React/Next.js runtime removal**. The first is already underway and can proceed without changing APIs. The second is achievable but requires a separate delivery and server plan. The lowest-risk next milestone is to finish the session-history controller migration and specify the vanilla plugin contract before converting the dashboard shell.
