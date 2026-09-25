---
name: fallow
description: Analyze JavaScript and TypeScript code health, dead code, duplication, complexity, architecture, or cleanup with Fallow.
license: MIT
metadata:
  author: Bart Waardenburg
  version: 1.0.0
  homepage: https://docs.fallow.tools
---

# Fallow

Use Fallow when asked to inspect JavaScript or TypeScript code health, dead code, duplication, complexity, architecture boundaries, or cleanup opportunities. It is a static analysis tool, not a type checker or proof that a security candidate is exploitable.

## Use the repository version

Fallow is a project dependency. Run it through npm exec so the installed repository version is used. Check package.json and the lockfile if command behavior or output fields matter. Read the project’s Fallow configuration, if present, before changing it.

For a changed-code audit, use the project base ref and Fallow’s audit command, for example: npm exec -- fallow audit --changed-since main --ci. For structured findings, request JSON output and parse the documented envelope rather than scraping human output.

## Handle results and exit codes

- Exit 0 means no error-severity findings; exit 1 means findings were reported; exit 2 means a runtime, invocation, or configuration error.
- Preserve the exit status. Do not append || true to every command: that hides configuration and runtime failures. If a script needs to continue after exit 1, capture and branch on the status explicitly while still failing on exit 2.
- --changed-since scopes analysis; it does not report the entire project. Use a full audit when the user asks for a repository-wide view.
- Fallow’s security output is a set of candidates for verification, not a validated security finding.

## Fixes

When cleanup is requested, inspect a preview with fallow fix --dry-run. Review its actions and skips, then apply with fallow fix --yes in a non-interactive environment. Report any skipped low-confidence changes and verify the resulting diff. Do not apply fixes as an unrequested side effect of an audit.

## MatMetrics context

- Fallow analyzes JavaScript and TypeScript; it does not analyze Go. Use npm run go:test for the Go test suite and inspect Go packages directly for Go-specific quality work.
- CI runs repository checks in [ci.yml](../../workflows/ci.yml). Use the commands and configuration in this checkout rather than copied CI snippets from external examples.
- The project depends on Fallow in [package.json](../../../package.json).

## References

Read only the reference needed for the task:

- [CLI reference](references/cli-reference.md) for command flags and output fields.
- [Gotchas](references/gotchas.md) for false positives, fix behavior, and analysis limits.
- [Workflow patterns](references/patterns.md) for CI, migration, and audit recipes.

These references can be version-specific. Check the installed Fallow help and version when details disagree with the repository dependency.
