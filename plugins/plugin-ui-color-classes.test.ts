import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { globSync } from 'glob';
import {
  derivePluginAllowedClassTokens,
  PLUGIN_UI_REQUIRED_VARIANT_SEMANTIC_ROLE_MAP,
  PLUGIN_UI_CONTRACT_TOKEN_VARIANT_CLASS_MAP,
  validatePluginUiTokenVariants,
} from '../src/components/plugins/plugin-style-policy';
import { getPluginThemeTokens } from '../src/components/plugins/plugin-theme';

const repoRoot = process.cwd();
const REQUIREMENT_SOURCES = {
  allowlistDerivation: 'docs/blueprint.md#plugin-token-policy',
  themeTokenPolicy: 'issue:PLUG-224',
  normalizedVariantTokens: 'bug:BUG-329',
  forbiddenClassEnforcement: 'docs/blueprint.md#plugin-color-safety',
} as const;

const req = (key: keyof typeof REQUIREMENT_SOURCES): string =>
  `[req:${REQUIREMENT_SOURCES[key]}]`;

const readFileList = (pattern: string): string[] => {
  const options = { cwd: repoRoot };
  try {
    return globSync(pattern, options);
  } catch {
    return [];
  }
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
  /\b(?:text|bg|border)-(?:red|green|blue|amber|yellow|purple|pink|indigo|destructive|primary|secondary|accent|muted|foreground)(?:-(?:foreground|\d{2,3}))?(?:\/\d{1,3})?\b/;

const classNameExpressionPattern = /className\s*=\s*({[^}]*}|"[^"]*"|'[^']*')/g;
const stringLiteralPattern = /(["'`])((?:\\.|(?!\1).)*)\1/g;

function extractClassTokensFromSource(source: string): string[] {
  const tokens: string[] = [];

  const collectFromFragment = (fragment: string): void => {
    const matches = fragment.matchAll(stringLiteralPattern);
    for (const match of matches) {
      const value = match[2];
      value
        .split(/\s+/)
        .map((entry) => entry.trim())
        .filter(Boolean)
        .forEach((entry) => tokens.push(entry));
    }
  };

  const classNameMatches = source.matchAll(classNameExpressionPattern);
  for (const match of classNameMatches) {
    collectFromFragment(match[1]);
  }

  return tokens;
}

function findForbiddenClassTokens(tokens: Iterable<string>): string[] {
  return [
    ...new Set(
      [...tokens].filter((token) =>
        forbiddenPluginColorClassPattern.test(token)
      )
    ),
  ];
}

test('policy helper derives a normalized allowlist from variants and themes', () => {
  const allowlist = derivePluginAllowedClassTokens();

  assert.ok(
    allowlist.has('text-primary'),
    `${req('allowlistDerivation')} missing text-primary`
  );
  assert.ok(
    allowlist.has('bg-destructive/10'),
    `${req('allowlistDerivation')} missing bg-destructive/10`
  );
  assert.ok(
    allowlist.has('ui-tone-inline-warning'),
    `${req('allowlistDerivation')} missing warning tone token`
  );
  assert.ok(
    allowlist.has('text-[hsl(var(--color-on-success-container))]'),
    `${req('allowlistDerivation')} missing success container token`
  );
  for (const severity of ['error', 'warning', 'info']) {
    assert.ok(
      allowlist.has(`ui-pill-${severity}`),
      `${req('allowlistDerivation')} missing ${severity} severity pill token`
    );
  }
});

test('plugin theme tone variants resolve only policy-backed class tokens', () => {
  const allowlist = derivePluginAllowedClassTokens();
  const tones = ['default', 'info', 'warning', 'success', 'error'] as const;

  for (const tone of tones) {
    const tokens = getPluginThemeTokens(tone);
    Object.entries(tokens)
      .filter(
        ([slot, value]) =>
          slot !== 'inlineMessageToneVariant' && typeof value === 'string'
      )
      .map(([, value]) => value as string)
      .flatMap((value) => value.split(/\s+/).map((entry) => entry.trim()))
      .filter(Boolean)
      .forEach((entry) => {
        assert.ok(
          allowlist.has(entry),
          `${req('themeTokenPolicy')} expected theme token "${entry}" for tone "${tone}" to be present in policy allowlist`
        );
      });
  }
});

test('plugin token variant policy contains recognized, unique tokens for every semantic role', () => {
  assert.doesNotThrow(
    () =>
      validatePluginUiTokenVariants(PLUGIN_UI_CONTRACT_TOKEN_VARIANT_CLASS_MAP),
    `${req('normalizedVariantTokens')} expected the production plugin token policy to be valid`
  );

  const roleAssertions = Object.entries(
    PLUGIN_UI_REQUIRED_VARIANT_SEMANTIC_ROLE_MAP
  ).map(([variant, expectedRole]) => ({ variant, expectedRole }));

  for (const { variant, expectedRole } of roleAssertions) {
    assert.ok(
      variant in PLUGIN_UI_CONTRACT_TOKEN_VARIANT_CLASS_MAP,
      `${req('normalizedVariantTokens')} missing required ${expectedRole} variant ${variant}`
    );
    assert.equal(
      variant.split('.')[0],
      expectedRole,
      `${req('normalizedVariantTokens')} variant ${variant} has the wrong semantic role`
    );
  }
});

test('plugin token variant validator rejects invalid policy fixtures', () => {
  const recognizedTokens = new Set(['flex', 'text-primary']);
  const fixtures = [
    {
      name: 'empty token list',
      variants: { 'layout.fixture': [] },
      error: /must contain tokens/,
    },
    {
      name: 'empty token',
      variants: { 'layout.fixture': [''] },
      error: /non-normalized token/,
    },
    {
      name: 'surrounding whitespace',
      variants: { 'layout.fixture': [' flex'] },
      error: /non-normalized token/,
    },
    {
      name: 'embedded newline',
      variants: { 'layout.fixture': ['flex\ntext-primary'] },
      error: /non-normalized token/,
    },
    {
      name: 'duplicate token',
      variants: { 'layout.fixture': ['flex', 'flex'] },
      error: /duplicate token/,
    },
    {
      name: 'unknown utility',
      variants: { 'layout.fixture': ['animate-unapproved'] },
      error: /unknown policy token/,
    },
    {
      name: 'forbidden raw color class',
      variants: { 'layout.fixture': ['hover:bg-red-500'] },
      error: /forbidden raw color token/,
    },
  ] as const;

  for (const fixture of fixtures) {
    assert.throws(
      () =>
        validatePluginUiTokenVariants(fixture.variants, {
          recognizedTokens,
          requiredVariantRoles: {},
        }),
      fixture.error,
      `${req('normalizedVariantTokens')} expected ${fixture.name} fixture to fail`
    );
  }

  assert.throws(
    () =>
      validatePluginUiTokenVariants(
        { 'layout.fixture': ['flex'] },
        {
          recognizedTokens,
          requiredVariantRoles: { 'layout.fixture': 'surface' },
        }
      ),
    /must map to semantic role "surface"/,
    `${req('normalizedVariantTokens')} expected a mismatched semantic role to fail`
  );
});

test('plugin surfaces block forbidden semantic utility classes with per-file diagnostics', () => {
  const allowlist = derivePluginAllowedClassTokens();

  const violations = scannedFiles.flatMap((filePath) => {
    if (fileAllowlist.has(filePath)) {
      return [];
    }

    const source = readFileSync(path.join(repoRoot, filePath), 'utf8');
    const classTokens = extractClassTokensFromSource(source);
    const forbiddenTokens = findForbiddenClassTokens(classTokens).filter(
      (token) => !allowlist.has(token)
    );

    return forbiddenTokens.length > 0
      ? [
          `${filePath}: ${forbiddenTokens
            .sort((left, right) => left.localeCompare(right))
            .join(', ')}`,
        ]
      : [];
  });

  assert.deepEqual(
    violations,
    [],
    `${req('forbiddenClassEnforcement')} found forbidden hardcoded plugin color classes:\n${violations.join('\n')}`
  );
});
