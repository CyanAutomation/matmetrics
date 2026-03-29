# Plugin Maturity Score Changelog (2026-03-29)

This changelog tracks the published plugin maturity score artifact generated from the same scoring path used by the plugin manager API (`src/app/api/plugins/list/route.ts` → `scorePluginMaturity`).

## Score generation entrypoints and reporting source

- Runtime scoring entrypoint: `GET /api/plugins/list` computes each plugin scorecard with `scorePluginMaturity`.
- Published reporting artifact: `docs/plugin-maturity-scorecards.json` (generated via `npm run plugin:maturity:regenerate`).
- Regression guard: `src/lib/plugins/plugin-maturity-regression.test.ts` recomputes scores and manifest evidence hashes, then fails if published artifact rows diverge.

## Regenerated score snapshot

Source artifact cache key: `aa8ae027193549f37f41c783fda662b3cfdd79939864cfaa6fcb07658fc03a30`

| Plugin            | Score | Tier     | Declared tier | Manifest reviewed |
| ----------------- | ----: | -------- | ------------- | ----------------- |
| `tag-manager`     |    93 | `silver` | `bronze`      | `2026-03-24`      |
| `github-sync`     |    91 | `silver` | `bronze`      | `2026-03-29`      |
| `prompt-settings` |    91 | `silver` | `bronze`      | `2026-03-24`      |

## Reproducible regeneration steps

1. Recompute and publish the artifact:

   ```bash
   npm run plugin:maturity:regenerate
   ```

2. Verify the artifact has not drifted from current manifest evidence:

   ```bash
   node --import tsx --test src/lib/plugins/plugin-maturity-regression.test.ts
   ```

3. Commit both files when scores or manifest evidence hashes change:
   - `docs/plugin-maturity-scorecards.json`
   - `docs/plugin-maturity-score-changelog.md`

## Cache invalidation rule

`docs/plugin-maturity-scorecards.json` includes a `cacheKey` derived from plugin score + tier + declared tier + manifest evidence hash. Any relevant manifest or rubric change produces a new key, so stale published results can be invalidated deterministically.
