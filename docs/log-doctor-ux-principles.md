# Log Doctor UX Guardrails

This document defines UX constraints for Log Doctor audit settings.

## Principles

1. **Zero-config default path for non-technical users**
   - The default experience must work with no required setup.
   - Users should be able to run and review an audit without changing settings.

2. **One visible top-level strictness control**
   - Show only a single top-level strictness choice in primary UI.
   - Per-rule toggles, thresholds, and similar advanced controls must stay hidden behind an explicit advanced/custom path.

3. **Explicit justification for new user-facing audit options**
   - Any new user-facing audit option must include a written UX justification in the PR description (problem solved, user persona, and why existing controls are insufficient).
   - Without this justification, the option should not be added.

## PR Acceptance Checklist

Required for any PR that touches `plugins/log-doctor/src/components/log-doctor-audit-settings.tsx`:

- [ ] Default non-technical path still requires zero configuration.
- [ ] UI still exposes only one top-level strictness choice by default.
- [ ] Any added user-facing audit option includes explicit UX justification in the PR.
- [ ] Advanced controls remain hidden behind an advanced/custom affordance.
