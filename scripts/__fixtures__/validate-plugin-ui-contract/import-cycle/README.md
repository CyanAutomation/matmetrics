# Circular Dependency Test Fixture

This fixture contains **intentional circular imports** to test that the plugin UI contract validator (`scripts/validate-plugin-ui-contract.ts`) correctly handles cycles while still detecting all used UI primitives.

## Structure

- **dashboard.tsx** — Entry point; uses `PluginPageShell`, `PluginFormSection`, `PluginLoadingState`; imports `helperA`
- **helper-a.ts** — Exports `helperA()` function; imports `helperB` from helper-b.ts
- **helper-b.ts** — Exports `helperB()` function; uses `PluginErrorState` primitive; imports `helperA` from helper-a.ts (creates cycle)

## The Cycle

```
dashboard.tsx
    ↓ imports
helper-a.ts
    ↓ imports
helper-b.ts
    ↓ imports (back to)
helper-a.ts  ← cycle detected
```

## Validation Test

The test in `scripts/validate-plugin-ui-contract.test.ts` verifies:

1. The BFS traversal detects the cycle via a `visited` Set
2. Despite the cycle, all imported UI primitives are discovered:
   - `PluginPageShell` (from dashboard.tsx)
   - `PluginFormSection` (from dashboard.tsx)
   - `PluginLoadingState` (from dashboard.tsx)
   - `PluginErrorState` (from helper-b.ts, traversed before cycle is re-entered)

This regression test ensures the validator is robust against real-world circular imports that can occur in plugin code.

## References

- Validator implementation: `scripts/validate-plugin-ui-contract.ts` (lines 609–695)
- Test: `scripts/validate-plugin-ui-contract.test.ts` (lines 71–87)
- Plugin UI contract: `docs/plugin-ui-contract.md`
