import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  PLUGIN_SAFE_UTILITY_CLASS_ALLOWLIST,
  PLUGIN_UI_CONTRACT_TOKEN_VARIANT_CLASS_MAP,
} from '../src/components/plugins/plugin-style-policy';
import { getPluginThemeTokens } from '../src/components/plugins/plugin-theme';

const repoRoot = process.cwd();

const pluginIndexFiles = [
  'plugins/github-sync/src/index.ts',
  'plugins/log-doctor/src/index.ts',
  'plugins/prompt-settings/src/index.ts',
  'plugins/tag-manager/src/index.ts',
  'plugins/video-library/src/index.ts',
] as const;

const importPattern = /from\s+['"](@\/components\/[^'"]+)['"]/g;

const componentFiles = pluginIndexFiles.flatMap((filePath) => {
  const source = readFileSync(path.join(repoRoot, filePath), 'utf8');
  const imports = [...source.matchAll(importPattern)]
    .map((match) => match[1])
    .filter((modulePath) => !modulePath.includes('/plugins/'))
    .map((modulePath) => modulePath.replace('@/', 'src/') + '.tsx');

  return imports;
});

const scannedFiles = [
  ...pluginIndexFiles,
  ...new Set([
    ...componentFiles,
    'plugins/log-doctor/src/components/log-doctor.tsx',
  ]),
];

const forbiddenPluginColorClassPattern =
  /\b(?:text|bg|border)-(?:red|green|blue|amber|yellow|purple|pink|indigo|destructive|primary|secondary|accent|muted|foreground)(?:-(?:foreground|\d{2,3}))?(?:\/\d{1,3})?\b/g;

const tokenizedClassAllowlist = new Set<string>([
  ...PLUGIN_SAFE_UTILITY_CLASS_ALLOWLIST,
  ...Object.values(PLUGIN_UI_CONTRACT_TOKEN_VARIANT_CLASS_MAP).flat(),
]);

(['default', 'info', 'warning', 'success', 'error'] as const).forEach(
  (tone) => {
    const tokens = getPluginThemeTokens(tone);
    Object.values(tokens).forEach((value) => {
      value
        .split(/\s+/)
        .map((entry) => entry.trim())
        .filter(Boolean)
        .forEach((entry) => tokenizedClassAllowlist.add(entry));
    });
  }
);

test('plugin sources avoid hardcoded semantic color utility classes', () => {
  const violations = scannedFiles.flatMap((filePath) => {
    const source = readFileSync(path.join(repoRoot, filePath), 'utf8');
    const matches = source.match(forbiddenPluginColorClassPattern) ?? [];
    const disallowedMatches = matches.filter(
      (className) => !tokenizedClassAllowlist.has(className)
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
