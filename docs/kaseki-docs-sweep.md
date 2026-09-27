# Kaseki documentation sweep

`.github/workflows/kaseki-docs.yaml` submits a documentation-only task to the
Kaseki controller every Thursday at 05:00 UTC, or when manually dispatched. The
workflow is restricted to `main` and passes the triggering commit SHA to Kaseki.
The GitHub Actions job waits for Kaseki to finish and fails if the remote task or
its validation fails.

## Required GitHub configuration

Create a protected GitHub Environment named `kaseki-agent`. Require review by a
maintainer who did not trigger the deployment, restrict deployments to the
`main` branch, and restrict who can change the environment configuration. The
scheduled run waits for environment approval before contacting Kaseki.

Store these values only in that environment:

- `KASEKI_API_TOKEN`: an environment secret used to authenticate with the
  controller. The workflow exposes it only to authenticated API steps.
- `KASEKI_BASE_URL`: an environment variable set exactly to
  `https://kaseki-tunnel.scheimann.xyz`. The workflow rejects any other origin
  before sending the token.

Do not configure repository or organization fallbacks. The environment URL and
secret are one trust boundary: anyone who can change the URL or environment
protection can redirect the token or run the workflow without its intended gate.
The same environment is used by `.github/workflows/kaseki-dry.yaml`.

## Workflow behavior

The workflow checks controller health and readiness, authenticates with
`GET /api/gateway-test?stage=1`, submits a draft pull request task, and polls
`GET /api/runs/:id/status` for up to 185 minutes. The job timeout is 200 minutes.
The controller must support `GET /health`, `GET /ready`, the authenticated
gateway check, `POST /api/runs`, and the run status endpoint.

The submitted task is limited to `README.md` and `docs/**/*.md`, has a 100 KiB
diff limit, disables scouting and goal checks, and validates with
`npm run test:all && npm run lint`. If the documentation is already accurate,
Kaseki should make no changes and open no pull request. GitHub checks the
workflow commit out with read-only credentials and does not persist those
credentials in the checkout.

The idempotency key is a deterministic UUIDv5 derived from the repository,
workflow name, and GitHub Actions run ID. A retry or rerun therefore replays the
same Kaseki task. Both Kaseki workflows use a concurrency group that permits one
active and one pending run; GitHub replaces an older pending run when a newer
one queues. That latest-pending-wins behavior is intentional because each task
reviews one immutable `main` commit.

The Kaseki DRY sweep is also restricted to `main`. It uses the same immutable
commit and environment, and validates with `npm run verify && npm run lint`.

## Controller safeguards

The controller remains the enforcement point. Configure it to independently
verify the repository and immutable commit, enforce the changed-file policy and
a post-run diff check, publish only a draft branch-based pull request, and use
least-privilege, short-lived GitHub credentials. Do not rely on the workflow
prompt or supplied allowlist as the only protection against controller
misconfiguration or compromise.

## Repository security controls

Enable a `main` ruleset requiring pull-request review and the successful `build`,
`quality`, `go`, `workflow-lint`, and `dependency-review` checks. Require a
CodeQL check only if GitHub code scanning is configured to produce it. Restrict
direct pushes and workflow or environment configuration changes, and enable
secret scanning with push protection. These settings live in GitHub repository
configuration rather than workflow YAML.
