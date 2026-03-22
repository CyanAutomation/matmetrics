/**
 * Compare two semantic versions.
 * @param version1 First version (e.g., "1.2.3")
 * @param version2 Second version (e.g., "1.2.4")
 * @returns Negative if version1 < version2, 0 if equal, positive if version1 > version2
 */
export const compareVersions = (version1: string, version2: string): number => {
  const parts1 = version1.split('.').map((p) => parseInt(p, 10));
  const parts2 = version2.split('.').map((p) => parseInt(p, 10));

  for (let i = 0; i < 3; i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;

    if (p1 !== p2) {
      return p1 - p2;
    }
  }

  return 0;
};

/**
 * Check if currentVersion meets the minimum required version.
 * @param currentVersion The current version (e.g., "0.1.0")
 * @param minRequired The minimum required version (e.g., "0.2.0")
 * @returns true if currentVersion >= minRequired
 */
export const meetsMinimumVersion = (
  currentVersion: string,
  minRequired: string
): boolean => {
  return compareVersions(currentVersion, minRequired) >= 0;
};
