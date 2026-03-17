# MatMetrics Go Tooling

This module adds Go-based operational tooling without changing the live Next.js runtime.

## Commands

Build:

```bash
go build ./go/cmd/matmetrics-cli
```

List sessions as JSON:

```bash
go run ./go/cmd/matmetrics-cli sessions list --data-dir data --format json
```

Validate GitHub access:

```bash
GITHUB_TOKEN=... go run ./go/cmd/matmetrics-cli github validate --owner <owner> --repo <repo> --branch <branch>
```

Bulk sync local markdown sessions to GitHub:

```bash
GITHUB_TOKEN=... go run ./go/cmd/matmetrics-cli github sync-all --data-dir data --owner <owner> --repo <repo> --branch <branch>
```

Migrate legacy GitHub session paths from `sessions/YYYY/MM/...` to `data/YYYY/MM/...`:

```bash
GITHUB_TOKEN=... go run ./go/cmd/matmetrics-cli github migrate-layout --owner <owner> --repo <repo> --branch <branch>
```
