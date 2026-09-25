---
name: go-cli-development
description: Add or change Go CLI commands and the Go packages that support MatMetrics.
license: MIT
---

# Go CLI Development

Use this skill for the MatMetrics CLI, session domain logic, markdown parsing, local storage, or GitHub API packages.

## Follow the current structure

- The command router is [go/cmd/matmetrics-cli/main.go](../../../go/cmd/matmetrics-cli/main.go). It uses nested commands and returns errors from run; main reports failures to stderr.
- Shared session validation is in [internal/sessionapi/validation.go](../../../internal/sessionapi/validation.go).
- Markdown parsing and serialization are in [internal/markdown/markdown.go](../../../internal/markdown/markdown.go).
- Local session paths and listing are in [internal/storage/storage.go](../../../internal/storage/storage.go).
- GitHub API behavior is in [internal/githubapi/github.go](../../../internal/githubapi/github.go); HTTP function handlers are under [api/go](../../../api/go/).
- Cross-language session rules are in [docs/go-contract.md](../../../docs/go-contract.md).

Extend the existing command and package boundaries. Use a new flag.FlagSet with the same error-return style as nearby commands. Do not copy examples that call os.Exit inside subcommands or turn flags into an action selector.

The Go storage package does not implement PID lock files. Inspect the actual caller and filesystem guarantees before introducing any concurrency mechanism.

## Workflow

1. Find the closest command or package implementation and its tests.
2. Add a failing test for new command behavior, validation, parsing, or storage semantics.
3. Implement the smallest change in the owning package and keep CLI output stable unless the user requested a contract change.
4. Run focused Go tests, then use npm run go:test for the repository Go suite.
5. Build the CLI with go build ./go/cmd/matmetrics-cli.

If a change affects session behavior also implemented in TypeScript, use [cross-language-testing](../cross-language-testing/SKILL.md) and update the shared fixtures and contract as needed.
