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
import {
  PluginColorClassException,
  validatePluginColorClasses,
} from './plugin-ui-color-class-validator';

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

const colorClassExceptions: readonly PluginColorClassException[] = [
  {
    file: 'plugins/github-sync/src/components/github-sync-results.tsx',
    token: 'text-red-700',
    reason: 'Legacy sync error states migrate under PLUG-224.',
  },
  {
    file: 'plugins/log-doctor/src/components/log-doctor-audit-settings.tsx',
    token: 'border-primary',
    reason: 'Legacy selected audit option migrates under PLUG-224.',
  },
  {
    file: 'plugins/log-doctor/src/components/log-doctor-audit-settings.tsx',
    token: 'hover:bg-muted/30',
    reason: 'Legacy audit option hover state migrates under PLUG-224.',
  },
  {
    file: 'plugins/log-doctor/src/components/log-doctor-audit-settings.tsx',
    token: 'border-yellow-200',
    reason: 'Legacy warning alert migrates under PLUG-224.',
  },
  {
    file: 'plugins/log-doctor/src/components/log-doctor-audit-settings.tsx',
    token: 'bg-yellow-50',
    reason: 'Legacy warning alert migrates under PLUG-224.',
  },
  {
    file: 'plugins/log-doctor/src/components/log-doctor-audit-settings.tsx',
    token: 'text-yellow-800',
    reason: 'Legacy warning alert migrates under PLUG-224.',
  },
  {
    file: 'src/components/plugins/plugin-kit.tsx',
    token: 'bg-secondary/35',
    reason: 'Compatibility surface pending a policy token.',
  },
  {
    file: 'src/components/plugins/plugin-data-surface.tsx',
    token: 'bg-secondary/55',
    reason: 'Compatibility surface pending a policy token.',
  },
  {
    file: 'src/components/plugins/plugin-data-surface.tsx',
    token: 'bg-secondary/35',
    reason: 'Compatibility surface pending a policy token.',
  },
];

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

test('plugin token variant validator accepts recognized semantic color utilities', () => {
  const fixtures = [
    'bg-muted',
    'text-primary',
    'bg-destructive/10',
    'hover:bg-muted',
  ];

  for (const token of fixtures) {
    assert.doesNotThrow(
      () =>
        validatePluginUiTokenVariants(
          { 'layout.fixture': [token] },
          {
            recognizedTokens: new Set([token]),
            requiredVariantRoles: {},
          }
        ),
      `${req('normalizedVariantTokens')} expected recognized semantic token "${token}" to pass`
    );
  }
});

test('plugin token variant validator rejects raw palette color utilities', () => {
  const fixtures = [
    'bg-red-500',
    'hover:bg-red-500',
    'text-blue-600',
    'border-amber-200/50',
  ];

  for (const token of fixtures) {
    assert.throws(
      () =>
        validatePluginUiTokenVariants(
          { 'layout.fixture': [token] },
          {
            recognizedTokens: new Set([token]),
            requiredVariantRoles: {},
          }
        ),
      /forbidden raw color token/,
      `${req('normalizedVariantTokens')} expected raw palette token "${token}" to fail`
    );
  }
});

test('plugin surfaces block forbidden semantic utility classes with per-file diagnostics', () => {
  const allowlist = derivePluginAllowedClassTokens();

  const violations = scannedFiles.flatMap((filePath) => {
    const source = readFileSync(path.join(repoRoot, filePath), 'utf8');
    return validatePluginColorClasses(source, filePath, {
      allowedTokens: allowlist,
      exceptions: colorClassExceptions,
    }).map(
      ({ file, line, token, replacement }) =>
        `${file}:${line}: ${token} (replace with ${replacement})`
    );
  });

  assert.deepEqual(
    violations,
    [],
    `${req('forbiddenClassEnforcement')} found forbidden hardcoded plugin color classes:\n${violations.join('\n')}`
  );
});

test('plugin color class AST validator handles static JSX composition precisely', () => {
  const source = `
    const prose = 'text-red-500';
    const dynamic = getClasses();
    export const Fixture = ({ active }: { active: boolean }) => (
      <div className={cn(
        'text-primary',
        active ? 'bg-red-500' : 'bg-muted',
        \`border-amber-200/50 \${active ? 'text-blue-600' : dynamic}\`,
        dynamic
      )} data-example="text-pink-500">
        <span
          className={
            active
              ? 'hover:bg-green-600'
              : 'text-muted-foreground'
          }
        />
      </div>
    );
  `;

  assert.deepEqual(
    validatePluginColorClasses(source, 'fixture.tsx', {
      allowedTokens: new Set([
        'text-primary',
        'bg-muted',
        'text-muted-foreground',
      ]),
    }).map(({ line, token, replacement }) => ({ line, token, replacement })),
    [
      { line: 7, token: 'bg-red-500', replacement: 'bg-destructive/10' },
      {
        line: 8,
        token: 'border-amber-200/50',
        replacement: 'border-destructive/30',
      },
      { line: 8, token: 'text-blue-600', replacement: 'text-destructive' },
      {
        line: 14,
        token: 'hover:bg-green-600',
        replacement: 'hover:bg-destructive/10',
      },
    ]
  );
});

test('plugin color class AST validator applies token-scoped documented exceptions', () => {
  const source = `<div className="bg-red-500 text-blue-600" />`;
  const diagnostics = validatePluginColorClasses(source, 'legacy.tsx', {
    allowedTokens: new Set(),
    exceptions: [
      {
        file: 'legacy.tsx',
        token: 'bg-red-500',
        reason: 'Tracked legacy surface.',
      },
    ],
  });

  assert.deepEqual(
    diagnostics.map(({ token }) => token),
    ['text-blue-600']
  );
});
