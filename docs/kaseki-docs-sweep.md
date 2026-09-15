# Kaseki documentation sweep

`.github/workflows/docs-sweep.yaml` submits a documentation-only task to the
Kaseki controller every Thursday at 05:00 UTC, or when manually dispatched.

## Required GitHub configuration

Create a protected GitHub Environment named `kaseki-docs`. Require review by a
maintainer who does not approve their own request, and restrict who can alter its
configuration. Store the following values **only** in that environment:

- `KASEKI_API_TOKEN`: an environment secret used exclusively to authenticate to
  the controller.
- `KASEKI_BASE_URL`: an environment variable containing the controller HTTPS
  origin, with no path, query, or fragment. For example,
  `https://kaseki.example.com`.
- `KASEKI_ALLOWED_HOSTS`: an environment variable containing a comma-separated
  hostname allowlist that includes the hostname in `KASEKI_BASE_URL`. For the
  preceding example, set it to `kaseki.example.com`.

Do not configure fallbacks for these values at repository or organization scope.
The endpoint and its allowlist are security-sensitive trust anchors: anyone able
to change both can redirect the token. Treat environment configuration access as
equivalent to access to the Kaseki API token.

The workflow fails before contacting the controller if the origin is malformed
or its hostname is not allowlisted. It validates the origin before sending any
token-bearing request, never logs controller response bodies, and
uses a deterministic UUID `idempotencyKey` for a GitHub Actions run. Retrying or
re-running that same Actions run therefore replays the existing Kaseki task
instead of enqueueing another one. The workflow waits up to 350 minutes for the
controller's final status, so its GitHub concurrency group also serializes the
entire remote task.

## Operational notes

The controller must support `GET /health`, `GET /ready`, authenticated
`GET /api/gateway-test?stage=1`, `GET /api/preflight`, `POST /api/runs`, and
`GET /api/runs/:id/status` requests. The workflow pins Kaseki to the commit
that started the GitHub Actions run, requests and authorizes only changes to
`README.md` and `docs/**/*.md`, disables Kaseki scouting so it cannot broaden
that requested allowlist, and asks Kaseki to open no pull request when no
documentation changes are needed.

The controller remains the enforcement point. Configure it to independently
verify the repository and immutable ref, enforce the changed-file policy and a
post-run diff check, publish only a branch-based pull request, and use
least-privilege, short-lived GitHub credentials. Do not rely on the workflow
prompt or supplied allowlist as the sole protection against controller
misconfiguration or compromise.

## Required repository security controls

Enable the `main` ruleset and require successful `build`, `quality`, `go`,
`workflow-lint`, `dependency-review`, and CodeQL checks before merge. Require
pull-request review, restrict direct pushes and workflow/configuration edits, and
enable secret scanning with push protection. These settings protect the release
job and the protected Kaseki environment; they are GitHub repository settings,
not workflow-file defaults.
