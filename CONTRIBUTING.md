# Contributing

## Releases and changelog

MatMetrics uses Release Please to keep `CHANGELOG.md`, `package.json`,
`package-lock.json`, Git tags, and GitHub Releases in sync.

When a change is ready for release, use a Conventional Commit-style pull request
title. Release Please derives the next version and changelog entry from the
merged pull request title:

- `feat: add training-plan export` creates a minor release.
- `fix: prevent duplicate session import` creates a patch release.
- `feat!: replace the session format` (or a `BREAKING CHANGE:` footer) creates
  a major release.
- `docs:`, `test:`, `chore:`, and `refactor:` changes are not released on their
  own unless the release PR also includes a releasable change.

The workflow starts from the existing `1.2.0` baseline, so it deliberately does
not manufacture releases from the historical commit backlog. It first opens or
updates a release pull request; merging that pull request creates the tag and
GitHub Release. Do not edit a released changelog section by hand. Add notable
work to `Unreleased` only when it cannot be represented by the eventual pull
request title.
