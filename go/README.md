# MatMetrics Go Tooling

This module adds Go-based operational tooling without changing the live Next.js runtime.

## Commands

Build:

```bash
go build ./cmd/matmetrics-cli
```

List sessions as JSON:

```bash
go run ./cmd/matmetrics-cli sessions list --data-dir ../data --format json
```

Validate GitHub access:

```bash
GITHUB_TOKEN=... go run ./cmd/matmetrics-cli github validate --owner <owner> --repo <repo> --branch <branch>
```

Bulk sync local markdown sessions to GitHub:

```bash
GITHUB_TOKEN=... go run ./cmd/matmetrics-cli github sync-all --data-dir ../data --owner <owner> --repo <repo> --branch <branch>
```
