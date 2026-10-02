# Training Data Check

## Purpose and capabilities

- UI contract baseline: [docs/plugin-ui-contract.md](../../docs/plugin-ui-contract.md).
- UX guardrails: [docs/log-doctor-ux-principles.md](../../docs/log-doctor-ux-principles.md).

The Training Data Check plugin adds a **dashboard tab** for validating training files and reviewing session records.

- **Dashboard tab extension metadata:**
  - extension type: `dashboard_tab`
  - extension id: `log-doctor-dashboard-tab`
  - tab id: `log-doctor`
  - tab title: `Data check`
  - header title: `Data check`
  - icon: `clipboard-check`
  - component id: `log_doctor`

This metadata is declared in `plugins/log-doctor/plugin.json` and must stay aligned with runtime registration in `plugins/log-doctor/src/index.ts`.

## UI Ownership

- Canonical model: plugin-local feature UI lives under `plugins/<plugin>/src/components`.
- This plugin owns `plugins/log-doctor/src/components/*` as its feature UI surface.
- Shared cross-plugin primitives remain in `src/components/plugins` (for example `PluginPageShell`, `PluginLoadingState`, and `PluginConfirmationDialog`).
- `plugins/<plugin>/src/index.ts` must import feature renderers from `./components/*` (never from `@/components/*` plugin feature files).

## Usage

1. Ensure the plugin is discoverable and enabled in Dashboard → Plugins.
2. Open Dashboard → Data check.
3. The panel has two tabs: **File Validation** and **Session Audit**.

### File Validation tab

Scans markdown session files for structural issues (missing fields, format violations). Use this to find malformed session records before syncing.

### Session Audit tab

Reviews all logged sessions with deterministic checks and optional semantic checks. Deterministic rules inspect saved fields and statistics. Semantic rules reuse one assessment per described session and use centrally governed thresholds. Both kinds of findings appear in the same review flow.

**Simplified flow:**

1. **Run check** – run audit rules against all sessions.
2. **Review findings** – inspect flagged sessions and understand why each was flagged.
3. **Mark resolved/dismissed** – open a session review and mark it fixed or dismiss checks for now.

The status card at the top shows how many sessions currently need attention and suggests the next primary action. Advanced rule settings are available under the **Advanced** disclosure. Semantic findings are advisory and never change a session automatically. If semantic review is unavailable, deterministic checks still run and the results say so.

When semantic checks are enabled, each described session sends its description, notes, selected type, effort rating, and up to 12 saved technique tags to an external service in one assessment request. The session ID, date, duration, and video URL are not sent by Session Audit. The assessment is limited to training details and ignores health-related mentions. The same external-data notice appears before a user runs the audit.

**Audit rules:**

| Rule                        | Severity | Trigger                                                                                                        |
| --------------------------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| `no_techniques_high_effort` | error    | Effort ≥ 4 but no techniques recorded                                                                          |
| `empty_description`         | warning  | Session description is blank or missing                                                                        |
| `empty_notes`               | warning  | Session notes section is blank or missing                                                                      |
| `duration_outlier`          | info     | Session duration is a statistical outlier (outside mean ± N×stddev across all sessions; requires ≥ 3 sessions) |
| `category_mismatch`         | warning  | The selected type differs from a confident category suggestion                                                  |
| `unsupported_technique_tags` | warning  | One or more saved technique tags are not clearly supported by the entry                                        |
| `effort_conflict`           | warning  | The written text directly conflicts with selected effort                                                        |
| `low_information`           | info     | A non-empty entry lacks concrete, reusable training detail                                                      |
| `missing_reflection`        | info     | The entry has no meaningful reflection                                                                          |

The semantic thresholds are defined in `src/lib/jev-policy.ts` and are evaluated with the tooling described in [JEV threshold evaluation](../../docs/jev-evaluation.md). They are provisional and should not be changed based on mixed model versions.

Individual semantic switches stay in Advanced settings because category, technique-tag, and effort consistency checks differ from the detail and reflection suggestions. Existing strictness presets keep the default path simple; users who want a narrower set of semantic suggestions can disable individual rules in the custom path. Each session assessment is isolated, and at most three are in flight at once.

**Review details:**

- Sessions with active flags appear in the results list with severity badges.
- In session review, you can dismiss individual checks, dismiss all checks for now, or mark the session fixed.
- Reviewed sessions are excluded from the "needs attention" count but remain visible in results.
- Ignored rules are stored per-session and persist across audits.

## Verification

Run baseline checks:

```bash
npm test -- plugins/log-doctor/plugin.test.ts
npm test -- plugins/log-doctor/src/index.test.ts
npm test -- plugins/log-doctor/src/lib/audit-rules.test.ts
npm test -- plugins/log-doctor/src/components/log-doctor-state.test.ts
npm test -- plugins/log-doctor/src/components/log-doctor-destructive-actions.test.ts
npm test -- src/lib/plugins/plugin-contract-gate.test.ts
```

Manual verification:

1. Start the app with `npm run dev`.
2. Open Dashboard and verify the **Data check** tab appears.
3. Open the tab and confirm the **File Validation** and **Session Audit** tabs render.
4. Click **Run Audit** and verify flagged sessions appear.
5. Open a review dialog and confirm ignore/mark-reviewed actions persist across page reloads.

## Maturity governance (promotion to Gold)

Gold promotion is never automatic from score alone. Even when maturity scoring is `>= 85`, promotion requires a deliberate reviewer decision.

When approving Gold promotion, the reviewer must update plugin manifest maturity metadata with all of the following:

- `maturity.tier: gold`
- `maturity.lastReviewedAt` (review date)
- `maturity.notes` (review rationale and scope)

## UX governance for audit settings changes

For any PR touching `plugins/log-doctor/src/components/log-doctor-audit-settings.tsx`, complete the acceptance checklist in [docs/log-doctor-ux-principles.md](../../docs/log-doctor-ux-principles.md) before merge.

## Copy review pass (support consistency)

When updating user-facing text in Data check, run a copy review pass to keep wording consistent across product and support responses.

### Approved terms and intended meaning

- **How sensitive should checks be?**: The top-level control that decides how easily sessions are flagged.
- **What to fix now**: The section containing actions the user should take immediately to resolve a flagged session.
- **Missing techniques in hard sessions**: A high-effort session needs at least one technique name to describe what was practiced.
- **Missing session summary**: The session needs a short description of what was worked on.
- **Missing follow-up notes**: The session needs notes about what went well and what to improve next.
- **Session time looks off**: The recorded duration looks unusual and should be confirmed or corrected.

### Review checklist

1. Replace technical or statistical jargon with plain language.
2. Prefer action-oriented helper text that tells the user what to do next.
3. Reuse the approved terms above in UI copy, documentation, and support macros.
4. If a term changes, update this glossary in the same PR.
