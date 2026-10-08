# Kaseki documentation sweep

`.github/workflows/kaseki-docs.yaml` submits a documentation-only task to the
Kaseki controller every Thursday at 05:00 UTC, or when manually dispatched. The
workflow is restricted to `main` and submits the branch name `main` as Kaseki's
`ref`; it does not send the workflow-triggering commit SHA. Kaseki therefore
uses whichever commit `main` points to when it resolves the repository. The
GitHub Actions job waits for Kaseki to finish and fails if the remote task or
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
`GET /api/v1/gateway-test?stage=1`, submits a draft pull request task, and polls
`GET /api/v1/runs/:id/status` for up to 185 minutes. The job timeout is 200 minutes.
The controller must support `GET /health`, `GET /ready`, the authenticated
gateway check, `POST /api/v1/runs`, and the run status endpoint.

The submitted task is limited to `README.md` and `docs/**/*.md`, has a 100 KiB
diff limit, disables scouting and goal checks, and validates with
`npm run test:all && npm run lint`. If the documentation is already accurate,
Kaseki should make no changes and open no pull request. GitHub checks out the
`main` branch with read-only credentials and does not persist those credentials
in the checkout. This checkout supplies the workflow helper code; the `ref`
sent in the Kaseki request independently tells Kaseki to use `main`.

The idempotency key is a deterministic UUIDv5 derived from the repository,
workflow name, and GitHub Actions run ID. A retry or rerun therefore replays the
same Kaseki task. Both Kaseki workflows use a concurrency group that permits one
active and one pending run; GitHub replaces an older pending run when a newer
one queues. That latest-pending-wins behavior is intentional because each task
follows the latest `main` branch. The commit Kaseki resolves can be newer than
the commit that triggered or queued the workflow.

The Kaseki DRY sweep is also restricted to `main`. It submits the same branch
ref and uses the same environment, and validates with
`npm run verify && npm run lint`.

## Controller safeguards

The controller remains the enforcement point. Since the workflow submits the
mutable branch ref `main`, configure the controller to resolve it once when a
run starts, record the resolved commit SHA in the run details, and use that same
snapshot for analysis, validation, and the patch base. If `main` moves before
the patch is published, the controller should detect that and revalidate or
stop rather than silently applying work against a different base. Enforce the
changed-file policy and a post-run diff check, publish only a draft
branch-based pull request, and use least-privilege, short-lived GitHub
credentials. If the controller cannot record and preserve the resolved
snapshot, describe the sweep as mutable latest-`main` work rather than claiming
that the submitted ref is immutable. Do not rely on the workflow prompt or
supplied allowlist as the only protection against controller misconfiguration
or compromise.

## Repository security controls

Enable a `main` ruleset requiring pull-request review and the successful `build`,
`quality`, `go`, `workflow-lint`, and `dependency-review` checks. Require a
CodeQL check only if GitHub code scanning is configured to produce it. Restrict
direct pushes and workflow or environment configuration changes, and enable
secret scanning with push protection. These settings live in GitHub repository
configuration rather than workflow YAML.
