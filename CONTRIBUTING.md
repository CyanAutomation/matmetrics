# Contributing

## Manual releases and changelog

MatMetrics publishes GitHub Releases manually. The release tag and title use
`vX.Y`: count from `vX.0` through `vX.9`, then increment `X` and return to
`.0`. The existing history reached `1.12.0`, so the next release in this
sequence is `v2.0`.

The application and root npm package keep strict semantic versions because
plugin compatibility checks compare three-part versions. A GitHub release tag
`v2.0` therefore corresponds to `APP_VERSION` and `package.json` version
`2.0.0`. Do not create a `v2.0.0` tag. The in-app Version History displays
new-format whole releases as `vX.Y` and preserves the full labels for legacy
versions.

For each release:

1. Prepare a pull request that updates the root version in `package.json` and
   `package-lock.json`, `src/lib/app-version.ts`, and the top release entry in
   `CHANGELOG.md`. Use the internal `X.Y.0` version in those files and a `vX.Y`
   tag in GitHub links. Move the included changes from `Unreleased` into the
   dated release entry and review the notes.
2. Confirm the required CI checks pass and merge the release pull request.
3. On GitHub, draft a release from the merged `main` commit. Create the `vX.Y`
   tag at that commit, use `vX.Y` as the title, copy the reviewed changelog
   notes, and publish it.

Keep historical tags. They preserve commit references and changelog comparison
links. Future comparison links should use the previous and new GitHub tags, for
example `nextn-v1.12.0...v2.0` for the first release under this convention and
`v2.0...v2.1` for the next.
