# Fallow Maintainability Baseline

This repository uses Fallow as a staged maintainability gate. The baseline is
reviewed after each hotspot refactor rather than treating every static finding
as an automatic deletion candidate.

## Intentional findings

The import cycle under
`scripts/__fixtures__/validate-plugin-ui-contract/import-cycle/` is deliberate
test data. It verifies that the plugin UI contract validator handles cycles
without skipping reachable imports. The fixture must remain unchanged; its
cycle should be excluded from production health scoring if Fallow reports it.

Fallow treats the following source files as available internal building blocks
or direct-invocation tools even though application code does not import them:

- `src/components/ui/radio-group.tsx` is a shared UI primitive.
- `src/components/ui/section.tsx` is the documented page-section layout
  primitive in `DESIGN.md`.
- `scripts/convert-images.js` is a manual image conversion command run directly
  with Node.

Each carries a file-level `unused-file` suppression for that reason. Keep the
reason current if these files change ownership or usage.

## Triage rules

- Production complexity and duplicate logic are implementation work.
- Test files and fixture files require reachability review before deletion.
- Export removal requires a repository-wide search across scripts, tests, and
  plugin registration before it is accepted.
- Dependency findings must be confirmed against actual runtime and build
  imports before changing `package.json`.

## Ratchet policy

1. Record a fresh JSON report before each refactoring batch.
2. Keep intentional exclusions documented with the reason and owning test.
3. Do not introduce new findings in changed production areas.
4. Lower the accepted hotspot count after the LogDoctor and maturity phases.
5. Require the full project verification commands before removing a baseline
entry.

## Latest measured snapshot

On 2026-10-01, Fallow 3.22.0 reported 0 unused files, 0 unused value exports,
and 14 unused type exports. The type-only findings are retained at plugin,
schema, scoring, and component API boundaries until their contract owners
confirm they can be removed. Maintainability averaged 92.4; 166 functions still
exceed at least one configured threshold (28 critical, 48 high, and 90 moderate).
Coverage gaps are 28 of 284 runtime files (90.1% file coverage), with 59
untested exports. Clone detection found 30 groups and 2.40% duplicated lines.

The highest-churn files remain `src/lib/storage.ts` (score 51, cooling),
`workers/matmetrics-data/src/index.ts` (33.6, cooling),
`src/components/session-history.tsx` (27.1, accelerating), and
`src/components/dashboard-overview.tsx` (25.7, accelerating). The dashboard
stats calculation has been extracted and tested, and the worker now has direct
integration coverage through its production entry point. Continue with focused
refactoring in storage, session history, and the worker; the complexity backlog
is still large, and split each hotspot behind tests rather than suppressing its
findings.

Session-history row and review-panel render tests already execute, and their
Istanbul statement counters show hits. Fallow still sees zero function coverage
for those component functions, so check the C8/source-map function mapping
before adding duplicate render tests to address those CRAP findings.

The custom `matmetrics-tests` framework plugin in `.fallowrc.json` marks the
project's dynamically discovered test files as test roots. This lets Fallow
exclude test code from runtime coverage gaps while still using Istanbul data
to score production functions. Run `npm run health:coverage` to execute the
suite and produce the report from `coverage/coverage-final.json`.
