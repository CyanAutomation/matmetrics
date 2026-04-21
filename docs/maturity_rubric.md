# Maturity Scoring Rubric

## Overview

This rubric measures how close a repository is to being a reliable, runnable, and maintainable product—not how clever, large, or popular it is. Use this rubric to assess any open-source or internal project and identify the most impactful areas for improvement.

### How Agents Should Use This Rubric

This rubric is **guidance for AI agents to evaluate repositories on demand**. Agents should:

1. **Inspect the repository** — Examine the codebase, documentation, CI/CD workflows, test structure, and git history
2. **Score each category** (0–5) — Apply the checks and evidence listed in [Base Rubric Details](#base-rubric-details) to each of the 9 categories
3. **Calculate the base score** — Use the weighted formula in [Base Score Calculation](#base-score-calculation)
4. **Determine repo type** — Identify if the repo is an App/Product, Library/Tooling, Hardware-Integrated, or Experimental project
5. **Apply modifiers** — Add or subtract points based on [Modifiers](#modifiers)
6. **Apply penalties** — Deduct points for risky states per [Penalties](#penalties)
7. **Classify tier** — Map final score to tier per [Output Interpretation](#output-interpretation)
8. **Generate report** — Produce a structured JSON summary with date, scores, category breakdowns, evidence, and actionable improvement areas

This rubric is **not** backed by executable code in the repository. Agents performing maturity evaluations should use this document as the authoritative specification and apply the logic based on direct repository inspection.

### Core Principle

Your maturity score answers:

"How close is this repo to being a reliable, runnable, maintainable product?"

Not:

- how clever it is
- how big it is
- how popular it is

## Scoring System Structure

Final Score = Base Score (0–100) + Modifiers (±10 max) – Penalties (0–20 max)

- **Base Score** — universal across all repos (deterministic, 0–100)
- **Modifiers** — small adjustments based on repo type (±10 max)
- **Penalties** — hard deductions for risky or broken states (0–20 max cap)

## Base Rubric Categories

The base rubric contains 9 deterministic categories, each scored 0–5 and weighted to produce a universal 0–100 base score.

| Category | Weight | Purpose |
|----------|--------|---------|
| Repository Completeness | 10% | Essential repo metadata and release hygiene |
| Setup & Reproducibility | 15% | Clear onboarding and one-command startup |
| Runtime Operability | 15% | Stable execution and observable behavior |
| Testing & Verification | 15% | Test coverage and automation |
| CI/CD & Delivery | 10% | Build pipeline and release infrastructure |
| Codebase Maintainability | 10% | Structure, cleanliness, and tooling |
| Security & Dependency Hygiene | 10% | Secrets management and dependency safety |
| Documentation Depth | 10% | Usage examples, architecture, troubleshooting |
| Project Governance Signals | 5% | Issue/PR templates, active maintenance |

### Base Score Calculation

For each category:

```text
(category_score / 5) × weight = category_contribution
```

Sum all 9 contributions to reach the base score (0–100).

---

## Base Rubric Details

### 1. Repository Completeness (Weight: 10)

Ensures essential metadata and release management are in place.

**Checks:**

- README.md exists
- LICENSE exists
- Repo description set
- Topics/tags present
- At least 1 release or version tag

**Score:**

- 0 = missing README
- 1 = README only
- 2 = README + description
- 3 = + license
- 4 = + tags/topics
- 5 = + release/tag present

### 2. Setup & Reproducibility (Weight: 15)

Measures clarity of installation and onboarding from a clean clone.

**Checks:**

- Clear install instructions
- .env.example or config template
- One-command run (docker compose up, npm start, etc.)
- No hidden/manual steps required
- Works from clean clone

**Score:**

- 0 = cannot run
- 1 = unclear setup
- 2 = partial instructions
- 3 = works with effort
- 4 = reliable setup
- 5 = single-command reproducible

### 3. Runtime Operability (Weight: 15)

Evaluates stability, observability, and safe/demo modes.

**Checks:**

- App starts without crashing
- Healthcheck or status endpoint
- Logs visible
- Handles failure states
- Mock/demo mode (important for your projects)

**Score:**

- 0 = not runnable
- 1 = crashes / unstable
- 2 = runs but opaque
- 3 = runs reliably
- 4 = observable (logs/health)
- 5 = observable + safe/demo mode

### 4. Testing & Verification (Weight: 15)

Assesses test coverage and automation infrastructure.

**Checks:**

- Tests exist
- Tests runnable locally
- Tests in CI
- Multiple test types (unit/integration/smoke)

**Score:**

- 0 = none
- 1 = tests exist but unused
- 2 = manual tests
- 3 = automated tests
- 4 = CI runs tests
- 5 = CI + multiple layers

### 5. CI/CD & Delivery (Weight: 10)

Measures build, test, and release automation maturity.

**Checks:**

- GitHub Actions present
- Build/test workflow
- Release workflow or artifact
- Tagged versions

**Score:**

- 0 = none
- 1 = basic workflow
- 2 = builds only
- 3 = builds + tests
- 4 = release artifacts
- 5 = full pipeline (build/test/release)

### 6. Codebase Maintainability (Weight: 10)

Evaluates code organization, cleanliness, and tooling.

**Checks:**

- Structured directories
- No massive files (>500–1000 lines heuristic)
- Linting config exists
- Type checking (if applicable)
- Config separated from logic

**Score:**

- 0 = chaotic
- 1 = minimal structure
- 2 = some structure
- 3 = clean structure
- 4 = + lint/type tooling
- 5 = well modularised + clean boundaries

### 7. Security & Dependency Hygiene (Weight: 10)

Assesses secrets management and dependency safety practices.

**Checks:**

- No secrets in repo (basic scan)
- Dependency manifest exists
- Dependabot (or equivalent) config
- Pinned versions (not all latest)
- Minimal GitHub Actions permissions

**Score:**

- 0 = unsafe
- 1 = unknown
- 2 = basic deps only
- 3 = deps managed
- 4 = + automation (Dependabot)
- 5 = + secure practices (pinning, permissions)

### 8. Documentation Depth (Weight: 10)

Measures breadth and quality of user and developer documentation.

**Checks:**

- Usage examples
- Architecture overview
- Config explanation
- Troubleshooting section

**Score:**

- 0 = none
- 1 = basic README
- 2 = usage only
- 3 = + config explained
- 4 = + architecture
- 5 = + troubleshooting + clarity

### 9. Project Governance Signals (Weight: 5)

Evaluates maintenance signals and development workflow.

**Checks:**

- Issue templates
- PR templates
- Labels used
- Open issues maintained (not abandoned)

**Score:**

- 0 = none
- 1 = minimal
- 2 = templates exist
- 3 = some organisation
- 4 = actively maintained
- 5 = well-structured workflow

---

## Modifiers (±10 max)

Repo-type modifiers provide small but important adjustments to the base score. Use the modifier that best matches your project type.

### App / Product

Examples: webcam app, judo trainer, SaaS dashboard

**+2 points if:**

- Has UI/demo
- Has persistent storage strategy
- Has config system

**+2 points if:**

- Has mock/demo mode

### Library / Tooling

Examples: npm package, CLI tool, API client

**+2 points if:**

- Has versioned API
- Has usage examples

### Hardware-Integrated

Examples: Raspberry Pi projects, IoT devices, robotics

**+3 points if:**

- Hardware assumptions documented
- Fallback/mock mode exists
- Device mapping documented

### Experimental / Prototype

Examples: proof-of-concept, early-stage research

**-3 points if:**

- Explicitly marked experimental AND lacks setup

**+2 points if:**

- Has demo mode despite being experimental

---

## Penalties (0–20 max)

Penalties are deterministic hard deductions for risky or broken states. Penalties cap at -20 total.

### Critical Penalties (-10 each)

- **-10** — Repo cannot be run from provided instructions
- **-10** — Secrets detected in repository

### Medium Penalties (-5 each)

- **-5** — Default branch build fails
- **-5** — No install or run path exists

### Minor Penalties (-2 to -3 each)

- **-3** — Broken or conflicting dependencies
- **-3** — No license present (only if intended for reuse)
- **-2** — Last commit > 12 months AND no "stable/complete" note
- **-2** — Large unused files or obvious dead code

---

## Output Interpretation

Use these score buckets to interpret your final maturity score:

| Score Range | Interpretation | Meaning |
|---|---|---|
| 0–24 | Idea / Abandoned | Concept stage or inactive |
| 25–44 | Prototype | Early development, limited polish |
| 45–64 | Working Project | Functional, but setup or testing gaps exist |
| 65–79 | Maintainable Product | Reliable, documented, actively maintained |
| 80–100 | Mature Product | Production-ready, comprehensive, highly reliable |

---

## Scoring Examples

### Example 1: Node.js CLI Tool

A command-line interface for batch processing:

- **Repository Completeness** (5) — README, LICENSE, tagged releases, clear description
- **Setup & Reproducibility** (4) — Good install docs, .env.example, `npm install && npm start` works, but one optional dependency needs manual setup
- **Runtime Operability** (3) — Runs reliably, logs visible, but no health check or demo mode
- **Testing & Verification** (3) — Unit tests present and in CI, but missing integration tests
- **CI/CD & Delivery** (3) — GitHub Actions builds and tests, but no automated releases
- **Codebase Maintainability** (4) — Well-structured directories, ESLint/TypeScript enforced, clean boundaries
- **Security & Dependency Hygiene** (3) — Pinned versions, no secrets detected, but Dependabot not configured
- **Documentation Depth** (3) — README with examples, API documented, but no troubleshooting guide
- **Project Governance Signals** (2) — Issue template exists, but PR template missing, infrequent maintenance

**Base Score:** (5/5 × 10) + (4/5 × 15) + (3/5 × 15) + (3/5 × 15) + (3/5 × 10) + (4/5 × 10) + (3/5 × 10) + (3/5 × 10) + (2/5 × 5) = 10 + 12 + 9 + 9 + 6 + 8 + 6 + 6 + 2 = **68/100**

**Modifiers:** +2 (versioned API, usage examples) → **70/100**

**Interpretation:** **Maintainable Product** — reliable for production use, but testing coverage and release automation could be improved.

### Example 2: React Component Library (Early Stage)

A reusable component package:

- **Repository Completeness** (2) — README and description present, but no LICENSE or releases yet
- **Setup & Reproducibility** (2) — Install instructions present, but no .env.example; setup requires extra npm scripts
- **Runtime Operability** (4) — Storybook demo available; components render without crashes; logs available
- **Testing & Verification** (2) — Unit tests exist, but not run in CI; no integration tests
- **CI/CD & Delivery** (1) — No GitHub Actions workflow yet
- **Codebase Maintainability** (3) — Clear component structure, ESLint configured, but some components > 400 lines
- **Security & Dependency Hygiene** (2) — npm package.json present, but dependencies unpinned; no Dependabot
- **Documentation Depth** (2) — README with installation, but no architecture guide or troubleshooting
- **Project Governance Signals** (1) — No issue or PR templates

**Base Score:** (2/5 × 10) + (2/5 × 15) + (4/5 × 15) + (2/5 × 15) + (1/5 × 10) + (3/5 × 10) + (2/5 × 10) + (2/5 × 10) + (1/5 × 5) = 4 + 6 + 12 + 6 + 2 + 6 + 4 + 4 + 1 = **45/100**

**Modifiers:** +2 (has UI/Storybook, persistent component registry strategy), +2 (usage examples in Storybook) → **49/100**

**Interpretation:** **Working Project** — functional but early-stage; focus on CI/CD setup, test automation, and releasing a v1.0 to cross into "Maintainable Product" range.
