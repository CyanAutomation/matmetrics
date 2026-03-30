# Plugin UI governance

This document defines the lightweight visual approval workflow for plugin UI surfaces and shared primitives.

## Scope

Visual checks cover:

- Plugin page header/shell baseline (`PluginPageShell`).
- Shared primitives used across plugin UIs (`PluginSectionCard`, `PluginFormSection`, `PluginTableSection`).
- Destructive confirmation flows (`PluginDestructiveAction` / `PluginConfirmationDialog`).
- Standard plugin state treatment for each registered plugin (`loading`, `error`, `empty`, `success`, `populated`).

## Harness page

Use the visual harness route:

- `/plugin-visual-harness`

The harness intentionally renders stable fixture content so screenshot changes are attributable to UI updates rather than dynamic data.

## Baseline capture

1. Start from a clean branch.
2. Regenerate snapshots after intentional visual changes:

   ```bash
   npm run test:visual:update
   ```

3. Review updated baseline images in:
   - `src/tests/visual/plugin-surfaces.visual.spec.ts-snapshots/`

4. Commit both code and updated snapshots in the same pull request.

## CI enforcement

Visual diffs run in CI via `.github/workflows/plugin-visual-regression.yml` and will fail on unexpected screenshot deltas.

Run locally before pushing:

```bash
npm run test:visual
```

## Visual approval workflow

When CI reports a visual regression:

1. Inspect the failed diff image in the Playwright report artifact.
2. Decide whether the change is intentional.
3. If intentional:
   - Regenerate snapshots with `npm run test:visual:update`.
   - Include a short "Visual impact" note in the PR summary.
4. If unintentional:
   - Fix the UI/layout/tone regression and rerun `npm run test:visual`.

## Reviewer checklist

- Verify shell spacing, heading hierarchy, and card elevation remain consistent.
- Confirm section card/form/table primitives preserve layout and typography.
- Confirm destructive flow maintains expected warning tone and action emphasis.
- Confirm each plugin state remains semantically and visually distinct.
