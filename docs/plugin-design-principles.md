# Plugin Design Principles

This document outlines the strategic direction and design principles for MatMetrics plugins. It prioritizes features that complement the session tracking core and enhance the athlete's ability to understand and improve their training.

## Guiding Principles

Plugins should:

1. **Extend, not replace** — Plugins enhance the dashboard and session experience without duplicating core functionality
2. **Complement session data** — Leverage existing session history for deeper insights or connected workflows
3. **Preserve simplicity** — Each plugin solves one problem well; avoid feature bloat
4. **Enable data portability** — Plugins should work with GitHub-synced sessions and respect the frozen session contract

## Plugin Priority Tiers

### Tier 1: High-Impact (Core Enhancement Plugins)

These plugins directly enhance the value of session logging and provide immediate utility to athletes.

#### Training Analytics & Insights Plugin

**Purpose:** Complement the dashboard's basic metrics with deeper training analysis.

**Features:**

- Technique frequency trends over time (which techniques are you practicing most?)
- Effort progression patterns (are you training harder/easier over weeks?)
- Recovery patterns (rest days between sessions)
- Volume/intensity tracking by technique category (Nage-waza vs. Katame-waza vs. Shiai)

**Rationale:** Natural fit since session data and dashboard structure already exist. This leverages Tag Manager and session history to answer "how am I improving?" at scale.

**Technical notes:**

- Extends dashboard with analytics tab
- Reads from session storage (no new data model required)
- Uses design tokens from [docs/MARKDOWN_STYLE.md](../docs/blueprint.md) for consistent visualization

---

#### Export & Reporting Plugin

**Purpose:** Enable users to generate shareable, portable reports of their training data.

**Features:**

- Generate PDF reports (monthly/quarterly summaries, progress snapshots)
- Export to CSV for spreadsheet analysis
- Export to JSON for data portability and external tool integration
- Custom report templates (by date range, technique, category, or effort)

**Rationale:** Useful for sharing progress with coaches, analyzing patterns in external tools, and backing up data outside GitHub. Pairs well with GitHub Sync — users can sync to GitHub and export for external sharing.

**Technical notes:**

- Extends dashboard with reporting tab
- No new data model; reads frozen session structure
- May require third-party libraries for PDF generation

---

#### Training Program/Periodization Plugin

**Purpose:** Help athletes plan and track training blocks with goals and periodization.

**Features:**

- Define training phases/blocks (e.g., "4 weeks grip strength focus")
- Set technique focus goals for each block
- Track adherence to planned focus vs. actual practice
- Visual progress against phase goals

**Rationale:** Natural evolution of effort rating — moves from logging what happened to planning what should happen. Enables structured training progression (e.g., novice → competition prep → off-season).

**Technical notes:**

- New data model (training blocks, goals) stored in Firebase
- Extends dashboard with planning tab
- Syncs with session log to show adherence

---

### Tier 2: Supporting Plugins

These plugins solve specific athlete problems and pair well with Tier 1 plugins.

#### Session Review & Audit Plugin

**Purpose:** Maintain data quality by detecting and flagging incomplete or anomalous sessions.

**Features:**

- Flag sessions for manual review (incomplete notes, questionable effort ratings)
- Auto-detect anomalies (e.g., session marked 5-effort with no techniques logged)
- Suggest completions (e.g., "You logged effort=3 but no notes; add details?")
- Complements Log Doctor for enhanced data quality control

**Rationale:** High-effort sessions without technique data are warning signs; this catches them. Works alongside Log Doctor to maintain training journal integrity.

**Technical notes:**

- Validation rules independent of session contract
- Extends dashboard with audit tab
- Reads from session storage; no modifications to schema

---

#### Calendar Integration Plugin

**Purpose:** Visualize training patterns and rhythm across time.

**Features:**

- Calendar view of sessions with intensity heatmaps
- Export iCalendar format (iCal) for Google Calendar / Outlook integration
- Heatmap colors: intensity (effort) and frequency (sessions per day)
- Week/month/year views

**Rationale:** Helps athletes spot training rhythm patterns, recovery adequacy, and gaps. Calendar exports enable cross-platform awareness (phone calendar shows training days).

**Technical notes:**

- Extends dashboard with calendar tab
- Reads from session storage (no new data)
- Uses iCal standard for calendar export

---

#### Injury/Recovery Tracker Plugin

**Purpose:** Log and correlate soreness, injuries, and recovery alongside training.

**Features:**

- Log soreness levels and body parts (e.g., "right shoulder: mild")
- Log injuries with recovery timeline
- Log rest/recovery days
- Correlate technique choice with discomfort (which techniques stress which areas?)

**Rationale:** Essential for serious athletes. Prevents overuse injuries and helps identify technique weaknesses that stress specific joints.

**Technical notes:**

- New data model (recovery logs, injury records) in Firebase
- Extends dashboard with recovery tab
- Linked to session records for correlation analysis

---

### Tier 3: Lesser Priority (But Useful)

Useful plugins that provide secondary value; implement after Tier 1 and Tier 2 are mature.

#### Technique Library & Video Linking

- Link YouTube tutorials or coaching videos to techniques
- Playlist curation by category or difficulty
- Progress tracking: "I've watched this, tried this technique"

---

#### Sparring Partner Tracking

- Log who you trained with and notes about matches/rolls
- Partner profiles with win/loss ratios
- Training partner recommendations ("you often partner with X")

---

## Implementation Guidelines

When designing a new plugin:

1. **Reference the UI contract** — Follow [docs/plugin-ui-contract.md](plugin-ui-contract.md) for dashboard integration
2. **Check the capability policy** — Ensure your plugin meets maturity requirements in [docs/plugin-capability-policy.md](plugin-capability-policy.md)
3. **Use the session contract** — Do not modify the frozen session shape; extend storage only in Firebase
4. **Test with Markdown** — Verify local markdown exports work correctly
5. **Document state transitions** — Show empty, loading, error, and success states (see [plugin-ui-contract.md](plugin-ui-contract.md))

## See Also

- [docs/plugin-ui-contract.md](plugin-ui-contract.md) — UI component specifications
- [docs/go-contract.md](go-contract.md) — Frozen session data format
- [docs/plugin-capability-policy.md](plugin-capability-policy.md) — Feature gates and capability requirements
- [plugins/](../plugins) — Reference implementations of existing plugins
