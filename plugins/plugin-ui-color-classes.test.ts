import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { execSync } from 'node:child_process';
import {
  PLUGIN_SAFE_UTILITY_CLASS_ALLOWLIST,
  PLUGIN_UI_CONTRACT_TOKEN_VARIANT_CLASS_MAP,
} from '../src/components/plugins/plugin-style-policy';
import { getPluginThemeTokens } from '../src/components/plugins/plugin-theme';

const repoRoot = process.cwd();

const readFileList = (pattern: string): string[] => {
  const output = execSync(`rg --files -g '${pattern}'`, { cwd: repoRoot })
    .toString()
    .trim();

  if (!output) {
    return [];
  }

  return output.split('\n');
};

const scannedFiles = [
  ...readFileList('plugins/*/src/components/**/*.{ts,tsx}'),
  ...readFileList('src/components/plugins/**/*.{ts,tsx}'),
];

const fileAllowlist = new Set([
  'src/components/plugins/plugin-style-policy.ts',
  'src/components/plugins/plugin-theme.ts',
  'plugins/log-doctor/src/components/log-doctor-audit-settings.tsx',
  'plugins/github-sync/src/components/github-sync-results.tsx',
  'src/components/plugins/plugin-state.tsx',
  'src/components/plugins/plugin-kit.tsx',
  'src/components/plugins/plugin-data-surface.tsx',
]);

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
      if (typeof value !== 'string') {
        return;
      }

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
    if (fileAllowlist.has(filePath)) {
      return [];
    }

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
