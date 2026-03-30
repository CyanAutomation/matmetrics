import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { PLUGIN_SAFE_UTILITY_CLASS_ALLOWLIST } from '../src/components/plugins/plugin-style-policy';

const repoRoot = process.cwd();

const scannedFiles = [
  'plugins/github-sync/src/index.ts',
  'plugins/log-doctor/src/index.ts',
  'plugins/prompt-settings/src/index.ts',
  'plugins/tag-manager/src/index.ts',
  'plugins/video-library/src/index.ts',
  'src/components/github-settings.tsx',
  'src/components/prompt-settings.tsx',
  'src/components/tag-manager.tsx',
  'src/components/video-library.tsx',
  'plugins/log-doctor/src/components/log-doctor.tsx',
];

const forbiddenPluginColorClassPattern =
  /\b(?:text|bg|border)-(?:red|green|blue|amber|yellow|purple|pink|indigo)-(?:\d{2,3})(?:\/\d{1,3})?\b/g;

test('plugin sources avoid hardcoded semantic color utility classes', () => {
  const violations = scannedFiles.flatMap((filePath) => {
    const source = readFileSync(path.join(repoRoot, filePath), 'utf8');
    const matches = source.match(forbiddenPluginColorClassPattern) ?? [];
    const disallowedMatches = matches.filter(
      (className) =>
        !PLUGIN_SAFE_UTILITY_CLASS_ALLOWLIST.includes(
          className as (typeof PLUGIN_SAFE_UTILITY_CLASS_ALLOWLIST)[number]
        )
    );

    return disallowedMatches.length > 0
      ? [`${filePath} (${[...new Set(disallowedMatches)].join(', ')})`]
      : [];
  });

  assert.deepEqual(
    violations,
    [],
    `Found forbidden hardcoded plugin color classes in: ${violations.join(', ')}`
  );
});
