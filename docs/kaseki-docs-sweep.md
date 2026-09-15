# Kaseki documentation sweep

`.github/workflows/docs-sweep.yaml` submits a documentation-only task to the
Kaseki controller every Thursday at 05:00 UTC, or when manually dispatched.

## Required GitHub configuration

Create a GitHub Environment named `kaseki-docs`. Store `KASEKI_API_TOKEN` as an
environment secret there, and limit access to the environment to the maintainers
responsible for the controller.

Configure these repository or organization variables, limiting who can edit them:

- `KASEKI_BASE_URL`: the controller HTTPS origin, with no path, query, or
  fragment. For example, `https://kaseki.example.com`.
- `KASEKI_ALLOWED_HOSTS`: a comma-separated allowlist that includes the hostname
  in `KASEKI_BASE_URL`. For the preceding example, set it to
  `kaseki.example.com`.

The workflow fails before contacting the controller if the origin is malformed
or its hostname is not allowlisted. Its submission uses Kaseki's UUID
`idempotencyKey`, so HTTP retries do not enqueue duplicate documentation tasks.

## Operational notes

The controller must support `GET /health`, `GET /ready`, and authenticated
`POST /api/runs` requests. The workflow pins Kaseki to the commit that started
the GitHub Actions run, permits changes only to `README.md` and `docs/**/*.md`,
and asks Kaseki to open no pull request when no documentation changes are
needed.
