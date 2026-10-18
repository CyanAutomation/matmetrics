/**
 * Format a semver application version as its GitHub release tag.
 * New whole releases use vX.Y; legacy patch versions retain all three parts.
 */
export const formatReleaseTag = (version: string): string => {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error(`Release version "${version}" must use X.Y.Z format.`);
  }

  const [, major, minor, patch] = match;
  if (patch === '0' && Number(minor) <= 9) {
    return `v${major}.${minor}`;
  }

  return `v${major}.${minor}.${patch}`;
};
