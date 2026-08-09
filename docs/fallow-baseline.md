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

The current report that prompted this document identified LogDoctor validation,
LogDoctor rendering, plugin maturity scoring, and several large plugin UI
components as the first production targets.

## Dynamic test discovery

The JavaScript test command discovers `*.test.ts`, `*.test.tsx`, `*.spec.ts`,
and `*.spec.tsx` files dynamically. Fallow's static entrypoint analysis may
therefore report covered test files as unused files. These findings require
test-runner verification before deletion; they are not production dead-code
targets. In particular, `src/lib/github-storage.test.ts` is covered by the
project test command and must be preserved while it is split into focused
behavior suites.
