# Log Doctor Plugin

## Purpose and capabilities

The Log Doctor plugin adds a **dashboard tab** for plugin-focused log diagnostics and future health checks.

- **Dashboard tab extension metadata:**
  - extension type: `dashboard_tab`
  - extension id: `log-doctor-dashboard-tab`
  - tab id: `log-doctor`
  - tab title: `Log Doctor`
  - header title: `Log Doctor`
  - icon: `stethoscope`
  - component id: `log_doctor`

This metadata is declared in `plugins/log-doctor/plugin.json` and must stay aligned with runtime registration in `plugins/log-doctor/src/index.ts`.

## Usage

1. Ensure the plugin is discoverable and enabled in Dashboard → Plugins.
2. Open Dashboard → Log Doctor.
3. The panel has two tabs: **File Validation** and **Session Audit**.

### File Validation tab

Scans markdown session files for structural issues (missing fields, format violations). Use this to find malformed session records before syncing.

### Session Audit tab

Automatically detects quality issues across all logged sessions using rule-based analysis.

**Audit rules:**

| Rule | Severity | Trigger |
|------|----------|---------|
| `no_techniques_high_effort` | warning | Effort ≥ 4 but no techniques recorded |
| `empty_description` | info | Session description is blank or missing |
| `empty_notes` | info | Session notes section is blank or missing |
| `duration_outlier` | info | Session duration is a statistical outlier (outside mean ± N×stddev across all sessions; requires ≥ 3 sessions) |

**Review workflow:**

1. Click **Run Audit** to analyse all sessions.
2. Sessions with active flags appear in the results list with severity badges.
3. Click **Review** on any flagged session to open the review dialog.
4. In the dialog: ignore individual rules for that session, or mark the entire session as reviewed.
5. Reviewed sessions are excluded from the "needs attention" count but remain visible in results.
6. Ignored rules are stored per-session and persist across audits.

## Verification

Run baseline checks:

```bash
npm test -- plugins/log-doctor/plugin.test.ts
npm test -- plugins/log-doctor/src/index.test.ts
npm test -- plugins/log-doctor/src/lib/audit-rules.test.ts
npm test -- src/lib/plugins/plugin-contract-gate.test.ts
```

Manual verification:

1. Start the app with `npm run dev`.
2. Open Dashboard and verify the **Log Doctor** tab appears.
3. Open the tab and confirm the **File Validation** and **Session Audit** tabs render.
4. Click **Run Audit** and verify flagged sessions appear.
5. Open a review dialog and confirm ignore/mark-reviewed actions persist across page reloads.

## Maturity governance (promotion to Gold)

Gold promotion is never automatic from score alone. Even when maturity scoring is `>= 85`, promotion requires a deliberate reviewer decision.

When approving Gold promotion, the reviewer must update plugin manifest maturity metadata with all of the following:

- `maturity.tier: gold`
- `maturity.lastReviewedAt` (review date)
- `maturity.notes` (review rationale and scope)
