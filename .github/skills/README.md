# MatMetrics Skills

Eight repository skills describe project-specific workflows. Start with the skill that matches the code or task being changed, then follow its links to the implementation and tests.

## Skills

### Storage and sync

- [storage-facade](./storage-facade/SKILL.md) — session routing, persistence, caches, and offline queue.

### APIs and contracts

- [api-gateway-pattern](./api-gateway-pattern/SKILL.md) — authenticated TypeScript routes that proxy to Go.
- [cross-language-testing](./cross-language-testing/SKILL.md) — shared TypeScript and Go behavior, fixtures, and parity tests.
- [error-handling-patterns](./error-handling-patterns/SKILL.md) — subsystem errors and API response propagation.

### Go

- [go-cli-development](./go-cli-development/SKILL.md) — CLI commands and supporting Go packages.

### Plugins

- [plugin-manager](./plugin-manager/SKILL.md) — plugin manifests, UI registration, validation, and maturity.

### Code quality

- [fallow](./fallow/SKILL.md) — JavaScript and TypeScript static analysis with Fallow.

### Interface design

- [front-end-design](./front-end-design/SKILL.md) — visual hierarchy and interaction decisions for MatMetrics UI.

## Choose a skill

| Task                                   | Start here             | Add when needed                                                                |
| -------------------------------------- | ---------------------- | ------------------------------------------------------------------------------ |
| Session storage or offline sync        | storage-facade         | cross-language-testing if shared session behavior changes                      |
| TypeScript API that proxies to Go      | api-gateway-pattern    | cross-language-testing and error-handling-patterns when those contracts change |
| Shared TypeScript and Go behavior      | cross-language-testing | error-handling-patterns if error responses change                              |
| Go CLI or backend package              | go-cli-development     | cross-language-testing for shared behavior                                     |
| Plugin manifest or dashboard UI        | plugin-manager         | front-end-design for significant UI work                                       |
| Code health, dead code, or duplication | fallow                 | —                                                                              |
| Significant page or component design   | front-end-design       | plugin-manager for plugin surfaces                                             |

## Validate skills and project behavior

Validate skill frontmatter and local Markdown links:

    npm run validate:skills

Run the validator’s regression tests:

    npm run test:skills

Run the full TypeScript and Go suites:

    npm run test:all
    npm run go:test

Validate plugin dashboard UI composition:

    npm run validate:plugin-ui-contract

The plugin UI command checks registered dashboard component composition; it is not a standalone manifest-schema command. Manifest validation behavior is covered by the plugin validator and tests.

## Metadata convention

Each skill has YAML frontmatter with a name matching its folder and a non-empty description. License is recommended. The validator also checks repository-local Markdown links in skill files and references.

Keep skill entrypoints focused on task-specific decisions and links to current implementation. Prefer contracts, source files, and tests as the authority for details that change with the application.
