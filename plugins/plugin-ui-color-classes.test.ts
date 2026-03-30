import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const repoRoot = process.cwd();

const scannedFiles = [
  'plugins/github-sync/src/index.ts',
  'plugins/log-doctor/src/index.ts',
  'plugins/prompt-settings/src/index.ts',
  'plugins/tag-manager/src/index.ts',
  'plugins/video-library/src/index.ts',
  'plugins/log-doctor/src/components/log-doctor.tsx',
];

const forbiddenPluginColorClassPattern =
  /(?:^|\s)(?:text|bg|border)-(?:red|green|blue|amber|yellow|purple|pink|indigo)-(?:\d{2,3})(?:\b|\s)/;

test('plugin sources avoid hardcoded semantic color utility classes', () => {
  const violations = scannedFiles.flatMap((filePath) => {
    const source = readFileSync(path.join(repoRoot, filePath), 'utf8');
    return forbiddenPluginColorClassPattern.test(source) ? [filePath] : [];
  });

  assert.deepEqual(
    violations,
    [],
    `Found forbidden hardcoded plugin color classes in: ${violations.join(', ')}`
  );
});
