import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { APP_VERSION } from '@/lib/app-version';

export const RELEASE_SECTION_LABELS = [
  'Features',
  'Improvements',
  'Fixes',
  'Documentation',
] as const;

export type ReleaseSectionLabel = (typeof RELEASE_SECTION_LABELS)[number];

export type ReleaseEntry = {
  version: string;
  date: string;
  sections: {
    label: ReleaseSectionLabel;
    items: string[];
  }[];
};

const CHANGELOG_PATH = path.join(process.cwd(), 'CHANGELOG.md');
const RELEASE_HEADER_PATTERN = /^## \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})$/;
const SECTION_HEADER_PATTERN = /^### (.+)$/;
const BULLET_PATTERN = /^- (.+)$/;
const VALID_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ALLOWED_SECTION_LABELS = new Set<string>(RELEASE_SECTION_LABELS);

const compareSemanticVersions = (left: string, right: string): number => {
  const leftParts = left.split('.').map((part) => parseInt(part, 10));
  const rightParts = right.split('.').map((part) => parseInt(part, 10));
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
};

const assertValidIsoDate = (value: string, context: string) => {
  if (!VALID_DATE_PATTERN.test(value)) {
    throw new Error(`${context} must use YYYY-MM-DD format.`);
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new Error(`${context} must be a valid calendar date.`);
  }
};

export const parseChangelog = (source: string): ReleaseEntry[] => {
  const lines = source.split(/\r?\n/);
  const releases: ReleaseEntry[] = [];
  let currentRelease: ReleaseEntry | null = null;
  let currentSection: ReleaseEntry['sections'][number] | null = null;

  for (const line of lines) {
    const releaseMatch = line.match(RELEASE_HEADER_PATTERN);
    if (releaseMatch) {
      currentRelease = {
        version: releaseMatch[1],
        date: releaseMatch[2],
        sections: [],
      };
      assertValidIsoDate(
        currentRelease.date,
        `Release ${currentRelease.version} date`
      );
      releases.push(currentRelease);
      currentSection = null;
      continue;
    }

    const sectionMatch = line.match(SECTION_HEADER_PATTERN);
    if (sectionMatch) {
      if (!currentRelease) {
        continue;
      }

      const label = sectionMatch[1] as ReleaseSectionLabel;
      if (!ALLOWED_SECTION_LABELS.has(label)) {
        throw new Error(
          `Release ${currentRelease.version} has unsupported section "${sectionMatch[1]}".`
        );
      }

      currentSection = {
        label,
        items: [],
      };
      currentRelease.sections.push(currentSection);
      continue;
    }

    const bulletMatch = line.match(BULLET_PATTERN);
    if (bulletMatch && currentSection) {
      currentSection.items.push(bulletMatch[1]);
    }
  }

  if (releases.length === 0) {
    throw new Error('CHANGELOG.md does not contain any release entries.');
  }

  for (const release of releases) {
    if (release.sections.length === 0) {
      throw new Error(
        `Release ${release.version} must include at least one section.`
      );
    }

    for (const section of release.sections) {
      if (section.items.length === 0) {
        throw new Error(
          `Release ${release.version} section "${section.label}" must include at least one bullet.`
        );
      }
    }
  }

  const versions = new Set<string>();
  for (const release of releases) {
    if (versions.has(release.version)) {
      throw new Error(
        `Duplicate release version ${release.version} found in CHANGELOG.md.`
      );
    }
    versions.add(release.version);
  }

  for (let index = 1; index < releases.length; index += 1) {
    const previous = releases[index - 1];
    const current = releases[index];
    const versionDifference = compareSemanticVersions(
      previous.version,
      current.version
    );

    if (versionDifference <= 0 || previous.date < current.date) {
      throw new Error('CHANGELOG.md releases must be ordered newest-first.');
    }
  }

  return releases;
};

export const getRecentReleasesFromSource = (
  source: string,
  limit = 3
): ReleaseEntry[] => parseChangelog(source).slice(0, limit);

export const readChangelog = async (): Promise<string> =>
  readFile(CHANGELOG_PATH, 'utf8');

export const getRecentReleases = async (limit = 3): Promise<ReleaseEntry[]> =>
  getRecentReleasesFromSource(await readChangelog(), limit);

export const assertReleaseVersionConsistency = (
  releases: ReleaseEntry[],
  expectedVersion = APP_VERSION
) => {
  const latestRelease = releases[0];
  if (!latestRelease) {
    throw new Error('CHANGELOG.md does not contain a latest release entry.');
  }

  if (latestRelease.version !== expectedVersion) {
    throw new Error(
      `Latest changelog release ${latestRelease.version} does not match app version ${expectedVersion}.`
    );
  }
};
