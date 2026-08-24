# Changelog

All notable changes to MatMetrics are documented in this file.

> **History note:** This changelog was reconciled with Git history on 2026-08-16. The repository has no Git tags or GitHub Releases before this point. The entries below therefore record version-setting commits and product milestones, rather than claiming publication dates that cannot be verified.

## [1.3.1](https://github.com/CyanAutomation/matmetrics/compare/nextn-v1.3.0...nextn-v1.3.1) (2026-08-24)


### Bug Fixes

* recover malformed sessions and add Sentry ([59fd404](https://github.com/CyanAutomation/matmetrics/commit/59fd404cdb1913774557b1537602cf6f810958a1))
* recover malformed sessions and add Sentry ([#646](https://github.com/CyanAutomation/matmetrics/issues/646)) ([651c4e1](https://github.com/CyanAutomation/matmetrics/commit/651c4e1db2d16c37514dde4e3835fe1e2d814102))

## [1.3.0](https://github.com/CyanAutomation/matmetrics/compare/nextn-v1.2.0...nextn-v1.3.0) (2026-08-24)


### Features

* refresh training dashboard insights ([2671b16](https://github.com/CyanAutomation/matmetrics/commit/2671b16cc6866308642b8e34c0ed405ff328eb2f))


### Bug Fixes

* add missing 1.1.0 and 1.0.0 CHANGELOG entries to unblock CI ([#629](https://github.com/CyanAutomation/matmetrics/issues/629)) ([0144456](https://github.com/CyanAutomation/matmetrics/commit/0144456de00cbb2a0eedc8c562b03cb8b8c601c8))
* add missing 1.1.0 and 1.0.0 release entries to CHANGELOG.md ([ef94d08](https://github.com/CyanAutomation/matmetrics/commit/ef94d0888b5f17df1b67f7d3cd9873bbdbbd811e))
* clarify terminology guidelines in transformer prompt ([451afc8](https://github.com/CyanAutomation/matmetrics/commit/451afc881e7aa3a4518fe176df56ca0b5cc84802))
* handle Cloudflare's variable content format + add error logging ([ea8d62c](https://github.com/CyanAutomation/matmetrics/commit/ea8d62c598bd4f9a10d8ca964962bf7f0d52deab))
* handle reasoning models + increase max_tokens to 2048 ([210c110](https://github.com/CyanAutomation/matmetrics/commit/210c11078748e845cf5016fd0ad8ac9f68d1659d))
* remove formatting from guidelines in DEFAULT_TRANSFORMER_PROMPT ([6bf1416](https://github.com/CyanAutomation/matmetrics/commit/6bf14160985a72d930fe66260a8860b501aff909))
* update summary text in OptionalFieldsSection for clarity ([8f65b55](https://github.com/CyanAutomation/matmetrics/commit/8f65b5531d35fa7adf81ef6d6ec97eff3bfcafe3))
* use Cloudflare direct API instead of gateway endpoint ([b585f6e](https://github.com/CyanAutomation/matmetrics/commit/b585f6eb9ebf301b62011db59093d9e57b062b6f))
* use OpenAI-compatible gateway endpoint (like kaseki-agent) ([fc68a5b](https://github.com/CyanAutomation/matmetrics/commit/fc68a5b87c5cab9f640648729e9dbd9d6f320e6d))


### Performance Improvements

* increase max_tokens to 4096 for longer descriptions ([a3e5516](https://github.com/CyanAutomation/matmetrics/commit/a3e5516aae143682f9df06304f5b0870c42b3ddf))

## [Unreleased]

### Features

- Added availability-aware training plans and personal training targets.
- Expanded the dashboard with clearer training-plan, category, and technique insights.
- Refreshed the built-in demo training data.

### Improvements

- Improved the athlete training workflow and dashboard clarity.
- Strengthened plugin maturity, discoverability, and UI-contract coverage.

### Fixes

- Prevented case-only tag merges and canonicalized target casing.
- Fixed Plugin Manager refresh loops, guarded concurrent guest-session imports, and tightened AI request validation.

## [1.2.0] - 2026-03-30

### Features

- Added the in-app version history modal and recent-releases API.
- Added validation that the application version and latest changelog entry stay aligned.

### Improvements

- Added plugin UI contract validation and plugin maturity score generation to the development workflow.

## [1.1.0] - 2026-03-01

### Features

- Added session categories, editable historical sessions, tag management, and light/dark themes.

### Improvements

- Improved dashboard layout and session-log experience.

## [1.0.0] - 2026-02-10

### Features

- Established the initial MatMetrics workspace and session-tracking foundation.
- Added dashboard and session-log experiences, including AI technique suggestions.
