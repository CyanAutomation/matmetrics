# MatMetrics Skills Quick Reference

## All 8 Skills (Organized by Use Case)

### Storage & Multi-Backend Systems

- **[storage-facade](/.github/skills/storage-facade/SKILL.md)** — Use when adding storage layers, caching strategy, or offline sync queue features
  - Topics: 3-layer architecture, manifest caching, file locking, sync queue, fallback logic
  - Reference files: `src/lib/session-storage.ts`, `src/lib/github-storage.ts`, `src/lib/file-storage.ts`

### Testing & Quality Assurance

- **[cross-language-testing](/.github/skills/cross-language-testing/SKILL.md)** — Use when implementing dual-language features or validating parity
  - Topics: fixture-driven testing, dual-mode auth, temp directories, type guards
  - Reference files: `testdata/validation/session-validation-fixtures.json`, `src/lib/server-auth.ts`, `internal/sessionapi/validation_test.go`

### API Development

- **[api-gateway-pattern](/.github/skills/api-gateway-pattern/SKILL.md)** — Use when building TypeScript route handlers that proxy to Go
  - Topics: request transformation, dual-mode auth, fallback logic, end-to-end testing
  - Reference files: `src/app/api/sessions/create/route.ts`, `internal/httpapi/httpapi.go`

### Error Handling

- **[error-handling-patterns](/.github/skills/error-handling-patterns/SKILL.md)** — Use when adding errors that span TypeScript and Go
  - Topics: custom error types, type guards, error classification, serialization
  - Reference files: `src/lib/errors.ts`, `internal/sessionapi/errors.go`, `src/lib/github-storage.ts`

### Go Backend Development

- **[go-cli-development](/.github/skills/go-cli-development/SKILL.md)** — Use when building CLI subcommands or Go backend logic
  - Topics: command routing, validation patterns, file locking, caching, markdown parsing
  - Reference files: `go/cmd/matmetrics-cli/main.go`, `internal/sessionapi/validation.go`, `internal/storage/storage.go`

### Plugin Development

- **[plugin-manager](/.github/skills/plugin-manager/SKILL.md)** — Use when creating/updating plugins or evaluating maturity
  - Topics: manifest schema, UI extension types, maturity tiers (Bronze/Silver/Gold), validation
  - Reference files: `plugins/prompt-settings/`, `plugins/github-sync/`, `docs/plugin-maturity-scorecards.json`

### Code Quality & Cleanup

- **[fallow](/.github/skills/fallow/SKILL.md)** — Use when auditing code health, finding dead code, or setting CI quality gates
  - Topics: TypeScript/JavaScript analysis, duplication detection, complexity hotspots, CI integration
  - Reference files: `.fallowrc.json` (matmetrics baseline), `run-lint.sh`, `test-runner.sh`

### Frontend Design

- **[front-end-design](/.github/skills/front-end-design/SKILL.md)** — Use when building landing pages, apps, or visually strong UIs
  - Topics: composition, hierarchy, imagery, motion, restraint
  - Reference examples: [/src/components/](../src/components/)

---

## Decision Tree: Which Skill to Use?

```
I'm working on...

├─ Storage or offline sync
│  └─ Use: storage-facade
│
├─ API route handler
│  └─ Proxy to Go?
│     ├─ Yes → api-gateway-pattern (+ cross-language-testing for parity)
│     └─ No  → Use Next.js docs directly
│
├─ Go CLI or backend
│  └─ Use: go-cli-development
│
├─ Testing or validation
│  └─ TypeScript + Go parity?
│     ├─ Yes → cross-language-testing
│     └─ No  → Use language-specific test frameworks
│
├─ Error handling
│  ├─ Spans TypeScript + Go? → error-handling-patterns
│  └─ Single language → Language-specific patterns
│
├─ Plugin development
│  └─ Use: plugin-manager
│
├─ Code cleanup or quality gates
│  └─ Use: fallow
│
└─ Frontend UI / Landing page
   └─ Use: front-end-design
```

---

## Skill Cross-References

### Used Together Frequently

| Scenario | Skills | Purpose |
|----------|--------|---------|
| Add new API endpoint (TypeScript → Go) | api-gateway-pattern + cross-language-testing + error-handling-patterns | Build and test the full round-trip |
| Implement storage feature | storage-facade + cross-language-testing (if validation parity needed) | Design multi-backend logic; ensure TypeScript↔Go sync |
| Build CLI subcommand | go-cli-development + error-handling-patterns | Implement Go logic; handle errors consistently |
| Release plugin | plugin-manager + fallow | Validate manifest, check code health, confirm maturity tier |
| Debug sync queue issue | storage-facade + error-handling-patterns | Trace through sync logic; classify error origin |

---

## Quick Commands

### Validate all skills

```bash
npx tsx scripts/validate-skill-metadata.ts
```

### Check code quality (fallow)

```bash
npx -y fallow audit --changed-since main --ci
```

### Run tests (cross-language parity)

```bash
npm test
go test ./internal/... ./api/go/...
```

### Validate plugin manifest

```bash
npx tsx scripts/validate-plugin-ui-contract.ts plugins/prompt-settings
```

---

## Next Steps

1. **Pick a skill** using the decision tree above
2. **Read the skill file** in `.github/skills/<skill-name>/SKILL.md`
3. **Follow the patterns** shown in reference files
4. **Write tests** using patterns from cross-language-testing or language-specific test frameworks
5. **Verify code quality** with fallow or language-specific linters

---

## Skill Metadata

All skills include:

- **Name, Description, License** — In YAML frontmatter
- **Trigger Rules** — When to use this skill
- **Architecture Overview** — How the pattern works
- **Code Examples** — In TypeScript and/or Go
- **Common Gotchas** — What to watch out for
- **References** — Links to source code
- **Next Steps** — How to apply the skill

See [.github/skills/](/.github/skills/) for all skill files.
