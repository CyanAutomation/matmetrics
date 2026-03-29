# Plugin Maturity Score Changelog (2026-03-29)

This changelog captures the score deltas after tightening UX maturity criteria in `scorePluginMaturity`.

## What changed

- Added explicit machine-checkable UX criteria in plugin manifest metadata:
  - `loadingStatePresent`
  - `errorStateWithRecovery`
  - `emptyStateWithCta`
  - `destructiveActionSafety` (`relevant`, `confirmation`, `cancellation`)
- Updated maturity scoring to require both:
  - explicit manifest declaration (`maturity.uxCriteria`), and
  - automated test evidence
    for each relevant UX criterion.
- Missing criteria now apply direct feature-quality penalties, so gaps materially reduce total score.

## Regenerated scores

| Plugin            | Previous | New | Delta | Tier change         |
| ----------------- | -------: | --: | ----: | ------------------- |
| `github-sync`     |       87 |  62 |   -25 | `silver` → `bronze` |
| `log-doctor`      |       87 |  67 |   -20 | `silver` → `bronze` |
| `prompt-settings` |       82 |  62 |   -20 | `silver` → `bronze` |

## Short delta notes

- `github-sync`: now penalized for missing machine-checkable loading/error/empty coverage and destructive-action confirmation/cancel safeguards.
- `log-doctor`: score remains comparatively stronger, but still loses points because stricter evaluator requires explicit error recovery, empty-state CTA, and destructive confirmation/cancel test assertions.
- `prompt-settings`: loses points for the same stricter machine-checkable UX criteria; existing tests and declarations do not yet satisfy all rubric checks.
