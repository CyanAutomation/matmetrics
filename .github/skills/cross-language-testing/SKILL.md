---
name: cross-language-testing
description: Change or verify behavior that must match between the TypeScript and Go implementations.
license: MIT
---

# Cross-Language Testing

Use this skill when a change affects shared session validation, markdown parsing, serialization, or another behavior implemented in both TypeScript and Go.

## Sources of truth

- The session and markdown contract is documented in [docs/go-contract.md](../../../docs/go-contract.md).
- Shared validation cases live in [session-validation-fixtures.json](../../../testdata/validation/session-validation-fixtures.json). Each entry has name, session, and the exact expected error string.
- TypeScript validates with validateSessionPayload in [session-validation.ts](../../../src/lib/session-validation.ts); fixture coverage is in [session-validation.test.ts](../../../src/lib/session-validation.test.ts).
- Go validation is in [internal/sessionapi/validation.go](../../../internal/sessionapi/validation.go), with tests in [validation_test.go](../../../internal/sessionapi/validation_test.go).
- The actual TypeScript shape is JudoSession in [types.ts](../../../src/lib/types.ts), and the Go shape is in [internal/model/session.go](../../../internal/model/session.go).

Do not copy a session field list or expected-error example into this skill. Read the contract and fixtures for the current values. The category set includes Technical, Randori, Shiai, Cardio, and S&C; optional fields and validation rules are maintained in the contract.

## Test-driven workflow

1. Read the relevant contract, fixture cases, and both implementations.
2. Add or adjust a fixture that describes the expected behavior and exact error.
3. Run the TypeScript fixture test and the corresponding Go test. They should fail before the implementation change when the case exposes a missing behavior.
4. Update both implementations where the contract requires parity, then make both fixture tests pass.
5. Review API and markdown callers for any intentionally different boundary behavior; update the contract if the shared rule itself changed.

Use the repository commands npm run test:all and npm run go:test for broad verification. Authentication is implemented separately in TypeScript and Go; inspect [server-auth.ts](../../../src/lib/server-auth.ts) and [internal/httpapi/httpapi.go](../../../internal/httpapi/httpapi.go) and their tests before asserting parity. In particular, do not assume the test-mode environment gates are identical.

## References

- [Session contract](../../../docs/go-contract.md)
- [Shared validation fixtures](../../../testdata/validation/session-validation-fixtures.json)
- [TypeScript validator tests](../../../src/lib/session-validation.test.ts)
- [Go validator tests](../../../internal/sessionapi/validation_test.go)
- [Markdown serializer](../../../src/lib/markdown-serializer.ts)
- [Go markdown parser](../../../internal/markdown/markdown.go)
