🧭 Core Principle

Your maturity score becomes:

“How close is this repo to being a reliable, runnable, maintainable product?”

Not:

* how clever it is
* how big it is
* how popular it is

⸻

🧱 Structure of the Scoring System

Final Score

Final Score = Base Score (0–100) + Modifiers (±10 max) – Penalties (0–20 max)

* Base Score → universal across all repos (deterministic)
* Modifiers → small adjustments based on repo type
* Penalties → hard deductions for risky/broken states

⸻

🧩 BASE RUBRIC (Deterministic, Machine-Checkable)

Each category is 0–5, then weighted.

1. Repository Completeness (Weight: 10)

Checks:

* README.md exists
* LICENSE exists
* Repo description set
* Topics/tags present
* At least 1 release or version tag

Score:

* 0 = missing README
* 1 = README only
* 2 = README + description
* 3 = + license
* 4 = + tags/topics
* 5 = + release/tag present

⸻

2. Setup & Reproducibility (Weight: 15)

Checks:

* Clear install instructions
* .env.example or config template
* One-command run (docker compose up, npm start, etc.)
* No hidden/manual steps required
* Works from clean clone

Score:

* 0 = cannot run
* 1 = unclear setup
* 2 = partial instructions
* 3 = works with effort
* 4 = reliable setup
* 5 = single-command reproducible

⸻

3. Runtime Operability (Weight: 15)

Checks:

* App starts without crashing
* Healthcheck or status endpoint
* Logs visible
* Handles failure states
* Mock/demo mode (important for your projects)

Score:

* 0 = not runnable
* 1 = crashes / unstable
* 2 = runs but opaque
* 3 = runs reliably
* 4 = observable (logs/health)
* 5 = observable + safe/demo mode

⸻

4. Testing & Verification (Weight: 15)

Checks:

* Tests exist
* Tests runnable locally
* Tests in CI
* Multiple test types (unit/integration/smoke)

Score:

* 0 = none
* 1 = tests exist but unused
* 2 = manual tests
* 3 = automated tests
* 4 = CI runs tests
* 5 = CI + multiple layers

⸻

5. CI/CD & Delivery (Weight: 10)

Checks:

* GitHub Actions present
* Build/test workflow
* Release workflow or artifact
* Tagged versions

Score:

* 0 = none
* 1 = basic workflow
* 2 = builds only
* 3 = builds + tests
* 4 = release artifacts
* 5 = full pipeline (build/test/release)

⸻

6. Codebase Maintainability (Weight: 10)

Checks:

* Structured directories
* No massive files (>500–1000 lines heuristic)
* Linting config exists
* Type checking (if applicable)
* Config separated from logic

Score:

* 0 = chaotic
* 1 = minimal structure
* 2 = some structure
* 3 = clean structure
* 4 = + lint/type tooling
* 5 = well modularised + clean boundaries

⸻

7. Security & Dependency Hygiene (Weight: 10)

Checks:

* No secrets in repo (basic scan)
* Dependency manifest exists
* Dependabot (or equivalent) config
* Pinned versions (not all latest)
* Minimal GitHub Actions permissions

Score:

* 0 = unsafe
* 1 = unknown
* 2 = basic deps only
* 3 = deps managed
* 4 = + automation (Dependabot)
* 5 = + secure practices (pinning, permissions)

⸻

8. Documentation Depth (Weight: 10)

Checks:

* Usage examples
* Architecture overview
* Config explanation
* Troubleshooting section

Score:

* 0 = none
* 1 = basic README
* 2 = usage only
* 3 = + config explained
* 4 = + architecture
* 5 = + troubleshooting + clarity

⸻

9. Project Governance Signals (Weight: 5)

Checks:

* Issue templates
* PR templates
* Labels used
* Open issues maintained (not abandoned)

Score:

* 0 = none
* 1 = minimal
* 2 = templates exist
* 3 = some organisation
* 4 = actively maintained
* 5 = well-structured workflow

⸻

🔢 Base Score Calculation

Each category:

(category_score / 5) * weight

Total = 100

⸻

⚙️ REPO-TYPE MODIFIERS (±10 max)

These are small but important.

App / Product (e.g. your webcam app, judo tracker)

+2 if:

* Has UI/demo
* Has persistent storage strategy
* Has config system

+2 if:

* Has mock/demo mode

⸻

Library / Tooling

+2 if:

* Has versioned API
* Has usage examples

⸻

Hardware-integrated (Raspberry Pi etc.)

+3 if:

* Hardware assumptions documented
* Fallback/mock mode exists
* Device mapping documented

⸻

Experimental / Prototype

-3 if:

* Explicitly marked experimental AND lacks setup

+2 if:

* Has demo mode despite being experimental

⸻

🚨 PENALTIES (Deterministic)

These are where the score becomes useful.

Critical penalties

* -10 → Repo cannot be run from instructions
* -10 → Secrets detected in repo
* -5 → Default branch build fails
* -5 → No install/run path exists
* -3 → Broken dependencies
* -3 → No license (only if intended for reuse)
* -2 → Last commit > 12 months AND no “stable/complete” note
* -2 → Large unused files / obvious dead code

Cap penalties at -20 total

⸻

🧠 Output Interpretation

Use buckets:

* 0–24 → Idea / abandoned
* 25–44 → Prototype
* 45–64 → Working project
* 65–79 → Maintainable product
* 80–100 → Mature product

