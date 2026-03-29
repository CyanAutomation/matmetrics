import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { scorePluginMaturity } from '@/lib/plugins/maturity';
import type {
  PluginManifest,
  PluginManifestMaturityMetadata,
  PluginValidationIssue,
} from '@/lib/plugins/types';

type FeatureUxCriterion = keyof NonNullable<
  PluginManifestMaturityMetadata['uxCriteria']
>;

type Assert<T extends true> = T;
type IsAssignable<From, To> = [From] extends [To] ? true : false;

// Compile-time regression guard for the maturity criteria filter.
// If the predicate loses its type guard, this widens to string[] and the
// assertions below fail during typecheck.
const allCriteriaForTypeCheck = [
  'loadingStatePresent',
  'errorStateWithRecovery',
  'emptyStateWithCta',
  'destructiveActionSafety',
] as const satisfies readonly FeatureUxCriterion[];
const uxCriterionRelevanceForTypeCheck: Record<FeatureUxCriterion, boolean> = {
  loadingStatePresent: true,
  errorStateWithRecovery: true,
  emptyStateWithCta: true,
  destructiveActionSafety: true,
};
const criteriaToEvaluateForTypeCheck = allCriteriaForTypeCheck.filter(
  (criterion): criterion is FeatureUxCriterion =>
    uxCriterionRelevanceForTypeCheck[criterion]
);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _criteriaMustBeFeatureUxCriterionArray: FeatureUxCriterion[] =
  criteriaToEvaluateForTypeCheck;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _criteriaMustNotWidenToStringArray = Assert<
  IsAssignable<string[], typeof criteriaToEvaluateForTypeCheck> extends true
    ? false
    : true
>;

const baseManifest: PluginManifest = {
  id: 'example-plugin',
  name: 'Example Plugin',
  version: '1.0.0',
  description: 'Example plugin',
  enabled: true,
  uiExtensions: [
    {
      type: 'dashboard_tab',
      id: 'example-dashboard-tab',
      title: 'Example',
      config: {
        tabId: 'example',
        headerTitle: 'Example',
        component: 'example_panel',
      },
    },
  ],
};

async function withPluginFixture(
  setup: (pluginsRoot: string, repoRoot: string) => Promise<void>,
  run: (pluginsRoot: string) => Promise<void>
) {
  const repoRoot = await mkdtemp(
    path.join(tmpdir(), 'matmetrics-plugin-score-')
  );
  const pluginsRoot = path.join(repoRoot, 'plugins');

  try {
    await mkdir(pluginsRoot, { recursive: true });
    await setup(pluginsRoot, repoRoot);
    await run(pluginsRoot);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
}

test('scorePluginMaturity returns Bronze for minimally documented plugin', async () => {
  await withPluginFixture(
    async (pluginsRoot, repoRoot) => {
      await mkdir(path.join(pluginsRoot, 'example-plugin', 'src'), {
        recursive: true,
      });
      await writeFile(
        path.join(pluginsRoot, 'example-plugin', 'src', 'index.ts'),
        `export const initPlugin = (context: { register?: (id: string) => void; registerPluginComponent?: (id: string, renderer: unknown) => void; }) => {
  context.register?.('example-dashboard-tab');
  context.registerPluginComponent?.('example_panel', () => null);
};
`,
        'utf8'
      );
      await mkdir(path.join(repoRoot, 'src', 'components'), {
        recursive: true,
      });
      await mkdir(path.join(repoRoot, 'src', 'tests'), { recursive: true });
      await writeFile(
        path.join(repoRoot, 'src', 'components', 'example-panel.tsx'),
        `export function ExamplePanel() {
  return null;
}
`,
        'utf8'
      );
    },
    async (pluginsRoot) => {
      const scorecard = await scorePluginMaturity({
        manifest: baseManifest,
        validationIssues: [],
        pluginDirectoryName: 'example-plugin',
        pluginsRoot,
      });

      assert.equal(scorecard.tier, 'bronze');
      assert.equal(scorecard.declaredTier, undefined);
      assert.ok(scorecard.nextActions.length > 0);
    }
  );
});

test('scorePluginMaturity caps plugin at Bronze when capability warning exists', async () => {
  const warning: PluginValidationIssue = {
    severity: 'warning',
    path: 'uiExtensions[0].capabilities',
    message:
      'Extension "example-dashboard-tab" requires capability "tag_mutation". Add it to manifest.capabilities to enable execution.',
  };

  await withPluginFixture(
    async (pluginsRoot, repoRoot) => {
      await mkdir(path.join(pluginsRoot, 'example-plugin', 'src'), {
        recursive: true,
      });
      await writeFile(
        path.join(pluginsRoot, 'example-plugin', 'src', 'index.ts'),
        `export const initPlugin = (context: { register?: (id: string) => void; registerPluginComponent?: (id: string, renderer: unknown) => void; }) => {
  context.register?.('example-dashboard-tab');
  context.registerPluginComponent?.('example_panel', () => null);
};
`,
        'utf8'
      );
      await mkdir(path.join(repoRoot, 'src', 'components'), {
        recursive: true,
      });
      await mkdir(path.join(repoRoot, 'src', 'tests'), { recursive: true });
      await writeFile(
        path.join(repoRoot, 'src', 'components', 'example-panel.tsx'),
        `export function ExamplePanel() {
  return null;
}
`,
        'utf8'
      );
      await writeFile(
        path.join(repoRoot, 'src', 'tests', 'example-plugin-route.test.ts'),
        `test('example plugin route', () => {
  'example-plugin';
});
`,
        'utf8'
      );
    },
    async (pluginsRoot) => {
      const scorecard = await scorePluginMaturity({
        manifest: {
          ...baseManifest,
          maturity: {
            tier: 'silver',
            notes: 'Attempting to advance maturity.',
            lastReviewedAt: '2026-03-24',
          },
        },
        validationIssues: [warning],
        pluginDirectoryName: 'example-plugin',
        pluginsRoot,
      });

      assert.equal(scorecard.tier, 'bronze');
      assert.ok(scorecard.reasons.length > 0);
    }
  );
});

test('scorePluginMaturity returns Silver for a fully documented and tested first-party plugin', async () => {
  await withPluginFixture(
    async (pluginsRoot, repoRoot) => {
      await mkdir(path.join(pluginsRoot, 'example-plugin', 'src'), {
        recursive: true,
      });
      await writeFile(
        path.join(pluginsRoot, 'example-plugin', 'src', 'index.ts'),
        `export const initPlugin = (context: { register?: (id: string) => void; registerPluginComponent?: (id: string, renderer: unknown) => void; }) => {
  context.register?.('example-dashboard-tab');
  context.registerPluginComponent?.('example_panel', () => null);
};
`,
        'utf8'
      );
      await writeFile(
        path.join(pluginsRoot, 'example-plugin', 'README.md'),
        '# Example Plugin\n',
        'utf8'
      );
      await mkdir(path.join(repoRoot, 'src', 'components'), {
        recursive: true,
      });
      await mkdir(path.join(repoRoot, 'src', 'lib', 'plugins'), {
        recursive: true,
      });
      await mkdir(path.join(repoRoot, 'src', 'tests'), { recursive: true });
      await writeFile(
        path.join(repoRoot, 'src', 'components', 'example-panel.tsx'),
        `export function ExamplePanel() {
  const disabled = false;
  const toast = () => disabled;
  return toast() ? null : null;
}
`,
        'utf8'
      );
      await writeFile(
        path.join(repoRoot, 'src', 'components', 'example-panel.test.tsx'),
        `import test from 'node:test';
import assert from 'node:assert/strict';

test('example panel renders with robust ux handling', () => {
  assert.match('loading state', /loading/);
  assert.match('error state, retry now', /retry/);
  assert.match('no results, add item', /add/);
  assert.match('confirm destructive reset', /confirm/);
  assert.match('cancel destructive reset', /cancel/);
});
`,
        'utf8'
      );
      await writeFile(
        path.join(repoRoot, 'src', 'tests', 'example-plugin-route.test.ts'),
        `test('example plugin route', () => {
  'example-plugin';
});
`,
        'utf8'
      );
      await writeFile(
        path.join(repoRoot, 'src', 'lib', 'plugins', 'example-plugin.test.ts'),
        `test('example plugin registry', () => {
  'example-plugin';
});
`,
        'utf8'
      );
    },
    async (pluginsRoot) => {
      const scorecard = await scorePluginMaturity({
        manifest: {
          ...baseManifest,
          maturity: {
            tier: 'silver',
            notes: 'Reviewed and documented.',
            lastReviewedAt: '2026-03-24',
            uxCriteria: {
              loadingStatePresent: true,
              errorStateWithRecovery: true,
              emptyStateWithCta: true,
              destructiveActionSafety: {
                relevant: true,
                confirmation: true,
                cancellation: true,
              },
            },
          },
        },
        validationIssues: [],
        pluginDirectoryName: 'example-plugin',
        pluginsRoot,
      });

      assert.equal(scorecard.tier, 'silver');
      assert.ok(scorecard.score >= 70);
      assert.equal(scorecard.declaredTier, 'silver');
      assert.ok(scorecard.reasons.every((reason) => !reason.includes('owner')));
      assert.ok(
        scorecard.nextActions.every((action) => !action.includes('owner'))
      );
    }
  );
});

test('scorePluginMaturity requires explicit manifest gold tier for Gold promotion', async () => {
  await withPluginFixture(
    async (pluginsRoot, repoRoot) => {
      await mkdir(path.join(pluginsRoot, 'example-plugin', 'src'), {
        recursive: true,
      });
      await writeFile(
        path.join(pluginsRoot, 'example-plugin', 'src', 'index.ts'),
        `export const initPlugin = (context: { register?: (id: string) => void; registerPluginComponent?: (id: string, renderer: unknown) => void; }) => {
  context.register?.('example-dashboard-tab');
  context.registerPluginComponent?.('example_panel', () => null);
};
`,
        'utf8'
      );
      await writeFile(
        path.join(pluginsRoot, 'example-plugin', 'README.md'),
        '# Example Plugin\n',
        'utf8'
      );
      await mkdir(path.join(repoRoot, 'src', 'components'), {
        recursive: true,
      });
      await mkdir(path.join(repoRoot, 'src', 'lib', 'plugins'), {
        recursive: true,
      });
      await mkdir(path.join(repoRoot, 'src', 'tests'), { recursive: true });
      await writeFile(
        path.join(repoRoot, 'src', 'components', 'example-panel.tsx'),
        `export function ExamplePanel() {
  const disabled = false;
  const toast = () => disabled;
  return toast() ? null : null;
}
`,
        'utf8'
      );
      await writeFile(
        path.join(repoRoot, 'src', 'components', 'example-panel.test.tsx'),
        `import test from 'node:test';
import assert from 'node:assert/strict';

test('example panel renders with robust ux handling', () => {
  assert.match('loading state', /loading/);
  assert.match('error state, retry now', /retry/);
  assert.match('no results, add item', /add/);
  assert.match('confirm destructive reset', /confirm/);
  assert.match('cancel destructive reset', /cancel/);
});
`,
        'utf8'
      );
      await writeFile(
        path.join(repoRoot, 'src', 'tests', 'example-plugin-route.test.ts'),
        `test('example plugin route', () => {
  'example-plugin';
});
`,
        'utf8'
      );
      await writeFile(
        path.join(repoRoot, 'src', 'lib', 'plugins', 'example-plugin.test.ts'),
        `test('example plugin registry', () => {
  'example-plugin';
});
`,
        'utf8'
      );
    },
    async (pluginsRoot) => {
      const maturityWithoutGoldTier = {
        tier: 'silver',
        notes: 'Reviewed and documented.',
        lastReviewedAt: '2026-03-24',
        uxCriteria: {
          loadingStatePresent: true,
          errorStateWithRecovery: true,
          emptyStateWithCta: true,
          destructiveActionSafety: {
            relevant: true,
            confirmation: true,
            cancellation: true,
          },
        },
        evidence: {
          testFiles: [
            'src/components/example-panel.test.tsx',
            'src/tests/example-plugin-route.test.ts',
            'src/lib/plugins/example-plugin.test.ts',
          ],
          uxCriteria: {
            loadingStatePresent: ['src/components/example-panel.test.tsx'],
            errorStateWithRecovery: ['src/components/example-panel.test.tsx'],
            emptyStateWithCta: ['src/components/example-panel.test.tsx'],
            destructiveActionSafety: ['src/components/example-panel.test.tsx'],
          },
        },
      } satisfies PluginManifestMaturityMetadata;

      const scorecardWithoutGoldTier = await scorePluginMaturity({
        manifest: {
          ...baseManifest,
          maturity: maturityWithoutGoldTier,
        },
        validationIssues: [],
        pluginDirectoryName: 'example-plugin',
        pluginsRoot,
      });

      assert.ok(scorecardWithoutGoldTier.score >= 85);
      assert.notEqual(scorecardWithoutGoldTier.tier, 'gold');
      assert.ok(
        scorecardWithoutGoldTier.reasons.some((reason) =>
          reason.includes(
            'Gold requires an explicit Gold review recorded in manifest maturity metadata.'
          )
        )
      );

      const scorecardWithGoldTier = await scorePluginMaturity({
        manifest: {
          ...baseManifest,
          maturity: {
            ...maturityWithoutGoldTier,
            tier: 'gold',
          },
        },
        validationIssues: [],
        pluginDirectoryName: 'example-plugin',
        pluginsRoot,
      });

      assert.ok(scorecardWithGoldTier.score >= 85);
      assert.equal(scorecardWithGoldTier.tier, 'gold');
      assert.equal(scorecardWithGoldTier.declaredTier, 'gold');
    }
  );
});

test('scorePluginMaturity awards feature-quality points for test-asserted UX states even with different implementation text', async () => {
  await withPluginFixture(
    async (pluginsRoot, repoRoot) => {
      await mkdir(path.join(pluginsRoot, 'example-plugin', 'src'), {
        recursive: true,
      });
      await writeFile(
        path.join(pluginsRoot, 'example-plugin', 'src', 'index.ts'),
        `export const initPlugin = (context: { register?: (id: string) => void; registerPluginComponent?: (id: string, renderer: unknown) => void; }) => {
  context.register?.('example-dashboard-tab');
  context.registerPluginComponent?.('example_panel', () => null);
};
`,
        'utf8'
      );
      await mkdir(path.join(repoRoot, 'src', 'components'), {
        recursive: true,
      });
      await mkdir(path.join(repoRoot, 'src', 'tests'), { recursive: true });
      await writeFile(
        path.join(repoRoot, 'src', 'components', 'example-panel.tsx'),
        `export function ExamplePanel() {
  return <section data-state='ready'>Panel body</section>;
}
`,
        'utf8'
      );
      await writeFile(
        path.join(repoRoot, 'src', 'tests', 'example-plugin-state.test.tsx'),
        `import test from 'node:test';
import assert from 'node:assert/strict';

test('panel state handling', () => {
  assert.match('pending request', /pending/);
  assert.match('request failed, retry', /retry/);
  assert.match('no results, add a session', /add/);
  assert.match('confirm destructive delete', /confirm/);
  assert.match('cancel destructive delete', /cancel/);
});
`,
        'utf8'
      );
    },
    async (pluginsRoot) => {
      const scorecard = await scorePluginMaturity({
        manifest: {
          ...baseManifest,
          maturity: {
            uxCriteria: {
              loadingStatePresent: true,
              errorStateWithRecovery: true,
              emptyStateWithCta: true,
              destructiveActionSafety: {
                relevant: true,
                confirmation: true,
                cancellation: true,
              },
            },
          },
        },
        validationIssues: [],
        pluginDirectoryName: 'example-plugin',
        pluginsRoot,
      });

      assert.ok(scorecard.categoryScores.feature_quality.earned >= 10);
    }
  );
});

test('scorePluginMaturity does not require undeclared error/empty criteria when policy gates relevance', async () => {
  await withPluginFixture(
    async (pluginsRoot, repoRoot) => {
      await mkdir(path.join(pluginsRoot, 'example-plugin', 'src'), {
        recursive: true,
      });
      await writeFile(
        path.join(pluginsRoot, 'example-plugin', 'src', 'index.ts'),
        `export const initPlugin = (context: { register?: (id: string) => void; registerPluginComponent?: (id: string, renderer: unknown) => void; }) => {
  context.register?.('example-dashboard-tab');
  context.registerPluginComponent?.('example_panel', () => null);
};
`,
        'utf8'
      );
      await mkdir(path.join(repoRoot, 'src', 'components'), {
        recursive: true,
      });
      await mkdir(path.join(repoRoot, 'src', 'tests'), { recursive: true });
      await writeFile(
        path.join(repoRoot, 'src', 'components', 'example-panel.tsx'),
        `export function ExamplePanel() {
  return <section data-state='ready'>Panel body</section>;
}
`,
        'utf8'
      );
      await writeFile(
        path.join(repoRoot, 'src', 'tests', 'example-plugin-state.test.tsx'),
        `import test from 'node:test';
import assert from 'node:assert/strict';

test('panel state handling', () => {
  assert.equal('request failed', 'request failed');
});
`,
        'utf8'
      );
    },
    async (pluginsRoot) => {
      const scorecard = await scorePluginMaturity({
        manifest: {
          ...baseManifest,
          maturity: {
            tier: 'bronze',
            notes: 'Declared loading behavior reviewed.',
            lastReviewedAt: '2026-03-24',
            uxStates: {
              loading: true,
            },
            uxCriteria: {
              errorStateWithRecovery: false,
              emptyStateWithCta: false,
            },
          },
        },
        validationIssues: [],
        pluginDirectoryName: 'example-plugin',
        pluginsRoot,
      });

      assert.ok(
        scorecard.reasons.every(
          (reason) =>
            !reason.includes(
              'Missing machine-checkable UX criterion: error state present with recovery.'
            )
        )
      );
      assert.ok(
        scorecard.reasons.every(
          (reason) =>
            !reason.includes(
              'Missing machine-checkable UX criterion: empty state present with CTA.'
            )
        )
      );
    }
  );
});

test('scorePluginMaturity ignores keyword-only UX matches when no criterion is relevant', async () => {
  await withPluginFixture(
    async (pluginsRoot, repoRoot) => {
      await mkdir(path.join(pluginsRoot, 'example-plugin', 'src'), {
        recursive: true,
      });
      await writeFile(
        path.join(pluginsRoot, 'example-plugin', 'src', 'index.ts'),
        `export const initPlugin = (context: { register?: (id: string) => void; registerPluginComponent?: (id: string, renderer: unknown) => void; }) => {
  context.register?.('example-dashboard-tab');
  context.registerPluginComponent?.('example_panel', () => null);
};
`,
        'utf8'
      );
      await mkdir(path.join(repoRoot, 'src', 'components'), {
        recursive: true,
      });
      await mkdir(path.join(repoRoot, 'src', 'tests'), { recursive: true });
      await writeFile(
        path.join(repoRoot, 'src', 'components', 'example-panel.tsx'),
        `export function ExamplePanel() {
  const words = ['Alert', 'toast', 'disabled', 'Dialog'];
  return <div>{words.join(', ')}</div>;
}
`,
        'utf8'
      );
      await writeFile(
        path.join(repoRoot, 'src', 'tests', 'example-plugin-keywords.test.ts'),
        `test('keyword smoke test', () => {
  const sentence = 'loading error empty';
  sentence;
});
`,
        'utf8'
      );
    },
    async (pluginsRoot) => {
      const scorecard = await scorePluginMaturity({
        manifest: baseManifest,
        validationIssues: [],
        pluginDirectoryName: 'example-plugin',
        pluginsRoot,
      });

      assert.ok(
        scorecard.reasons.every(
          (reason) =>
            !reason.includes('Missing machine-checkable UX criterion:')
        )
      );
      assert.ok(scorecard.categoryScores.feature_quality.earned <= 15);
    }
  );
});

test('scorePluginMaturity still warns when declared error criterion lacks test assertion evidence', async () => {
  await withPluginFixture(
    async (pluginsRoot, repoRoot) => {
      await mkdir(path.join(pluginsRoot, 'example-plugin', 'src'), {
        recursive: true,
      });
      await writeFile(
        path.join(pluginsRoot, 'example-plugin', 'src', 'index.ts'),
        `export const initPlugin = (context: { register?: (id: string) => void; registerPluginComponent?: (id: string, renderer: unknown) => void; }) => {
  context.register?.('example-dashboard-tab');
  context.registerPluginComponent?.('example_panel', () => null);
};
`,
        'utf8'
      );
      await mkdir(path.join(repoRoot, 'src', 'components'), {
        recursive: true,
      });
      await mkdir(path.join(repoRoot, 'src', 'tests'), { recursive: true });
      await writeFile(
        path.join(repoRoot, 'src', 'components', 'example-panel.tsx'),
        `export function ExamplePanel() {
  return <section data-state='ready'>Panel body</section>;
}
`,
        'utf8'
      );
      await writeFile(
        path.join(repoRoot, 'src', 'tests', 'example-plugin-state.test.tsx'),
        `import test from 'node:test';
import assert from 'node:assert/strict';

test('panel state handling', () => {
  assert.equal('request failed', 'request failed');
});
`,
        'utf8'
      );
    },
    async (pluginsRoot) => {
      const scorecard = await scorePluginMaturity({
        manifest: {
          ...baseManifest,
          maturity: {
            uxCriteria: {
              errorStateWithRecovery: true,
            },
          },
        },
        validationIssues: [],
        pluginDirectoryName: 'example-plugin',
        pluginsRoot,
      });

      assert.ok(
        scorecard.reasons.some((reason) =>
          reason.includes(
            'Missing machine-checkable UX criterion: error state present with recovery.'
          )
        )
      );
    }
  );
});

test('scorePluginMaturity preserves destructive-action relevance gating when no signal marks it relevant', async () => {
  await withPluginFixture(
    async (pluginsRoot, repoRoot) => {
      await mkdir(path.join(pluginsRoot, 'example-plugin', 'src'), {
        recursive: true,
      });
      await writeFile(
        path.join(pluginsRoot, 'example-plugin', 'src', 'index.ts'),
        `export const initPlugin = (context: { register?: (id: string) => void; registerPluginComponent?: (id: string, renderer: unknown) => void; }) => {
  context.register?.('example-dashboard-tab');
  context.registerPluginComponent?.('example_panel', () => null);
};
`,
        'utf8'
      );
      await mkdir(path.join(repoRoot, 'src', 'components'), {
        recursive: true,
      });
      await mkdir(path.join(repoRoot, 'src', 'tests'), { recursive: true });
      await writeFile(
        path.join(repoRoot, 'src', 'components', 'example-panel.tsx'),
        `export function ExamplePanel() {
  return <section data-state='ready'>Panel body</section>;
}
`,
        'utf8'
      );
      await writeFile(
        path.join(repoRoot, 'src', 'tests', 'example-plugin-state.test.tsx'),
        `import test from 'node:test';
import assert from 'node:assert/strict';

test('panel state handling', () => {
  assert.match('loading state', /loading/);
});
`,
        'utf8'
      );
    },
    async (pluginsRoot) => {
      const scorecard = await scorePluginMaturity({
        manifest: {
          ...baseManifest,
          maturity: {
            uxCriteria: {
              loadingStatePresent: true,
            },
          },
        },
        validationIssues: [],
        pluginDirectoryName: 'example-plugin',
        pluginsRoot,
      });

      assert.ok(
        scorecard.reasons.every(
          (reason) =>
            !reason.includes(
              'Missing machine-checkable UX criterion: destructive action confirmation + cancellation path.'
            )
        )
      );
    }
  );
});

test('scorePluginMaturity does not warn when manifest component matches plugin registration and file', async () => {
  await withPluginFixture(
    async (pluginsRoot, repoRoot) => {
      await mkdir(path.join(pluginsRoot, 'example-plugin', 'src'), {
        recursive: true,
      });
      await writeFile(
        path.join(pluginsRoot, 'example-plugin', 'src', 'index.ts'),
        `export const initPlugin = (context: { registerPluginComponent?: (id: string, renderer: unknown) => void; }) => {
  context.registerPluginComponent?.('example_panel', () => null);
};
`,
        'utf8'
      );
      await mkdir(path.join(repoRoot, 'src', 'components'), {
        recursive: true,
      });
      await writeFile(
        path.join(repoRoot, 'src', 'components', 'example-panel.tsx'),
        `export function ExamplePanel() {
  return null;
}
`,
        'utf8'
      );
    },
    async (pluginsRoot) => {
      const scorecard = await scorePluginMaturity({
        manifest: baseManifest,
        validationIssues: [],
        pluginDirectoryName: 'example-plugin',
        pluginsRoot,
      });

      assert.ok(
        scorecard.reasons.every(
          (reason) =>
            !reason.includes('register all manifest component ids') &&
            !reason.includes('do not map to checked-in UI modules')
        )
      );
    }
  );
});

test('scorePluginMaturity static scan matches optional/non-optional and spacing variants for registerPluginComponent', async () => {
  const registrationVariants = [
    "context.registerPluginComponent?.('example_panel', () => null);",
    "context.registerPluginComponent('example_panel', () => null);",
    `context.registerPluginComponent?.(
  'example_panel',
  () => null
);`,
  ];

  for (const registrationCall of registrationVariants) {
    await withPluginFixture(
      async (pluginsRoot, repoRoot) => {
        await mkdir(path.join(pluginsRoot, 'example-plugin', 'src'), {
          recursive: true,
        });
        await writeFile(
          path.join(pluginsRoot, 'example-plugin', 'src', 'index.ts'),
          `export const initPlugin = (context: { registerPluginComponent?: (id: string, renderer: unknown) => void; }) => {
  ${registrationCall}
};
`,
          'utf8'
        );
        await mkdir(path.join(repoRoot, 'src', 'components'), {
          recursive: true,
        });
        await writeFile(
          path.join(repoRoot, 'src', 'components', 'example-panel.tsx'),
          `export function ExamplePanel() {
  return null;
}
`,
          'utf8'
        );
      },
      async (pluginsRoot) => {
        const scorecard = await scorePluginMaturity({
          manifest: baseManifest,
          validationIssues: [],
          pluginDirectoryName: 'example-plugin',
          pluginsRoot,
        });

        assert.ok(
          scorecard.reasons.every(
            (reason) =>
              !reason.includes('register all manifest component ids') &&
              !reason.includes('do not map to checked-in UI modules')
          )
        );
        assert.ok(
          scorecard.nextActions.every(
            (action) =>
              !action.includes(
                'Keep registerPluginComponent calls aligned with manifest component ids for maintainability.'
              ) &&
              !action.includes(
                'Keep component ids and component files aligned.'
              )
          )
        );
      }
    );
  }
});

test('scorePluginMaturity warns when manifest component is missing from plugin registration', async () => {
  await withPluginFixture(
    async (pluginsRoot) => {
      await mkdir(path.join(pluginsRoot, 'example-plugin', 'src'), {
        recursive: true,
      });
      await writeFile(
        path.join(pluginsRoot, 'example-plugin', 'src', 'index.ts'),
        `export const initPlugin = (context: { registerPluginComponent?: (id: string, renderer: unknown) => void; }) => {
  context.registerPluginComponent?.('other_component', () => null);
};
`,
        'utf8'
      );
    },
    async (pluginsRoot) => {
      const scorecard = await scorePluginMaturity({
        manifest: baseManifest,
        validationIssues: [
          {
            severity: 'warning',
            path: 'uiExtensions[0].config.component',
            message:
              'Extension "example-dashboard-tab" declares component "example_panel" but no dashboard renderer is registered after plugin bootstrap.',
          },
        ],
        pluginDirectoryName: 'example-plugin',
        pluginsRoot,
      });

      assert.ok(
        scorecard.reasons.some((reason) =>
          reason.includes('do not resolve to registered renderers at runtime')
        )
      );
    }
  );
});

test('scorePluginMaturity accepts runtime registration without local/shared component files', async () => {
  await withPluginFixture(
    async (pluginsRoot) => {
      await mkdir(path.join(pluginsRoot, 'example-plugin', 'src'), {
        recursive: true,
      });
      await writeFile(
        path.join(pluginsRoot, 'example-plugin', 'src', 'index.ts'),
        `export const initPlugin = (context: { registerPluginComponent?: (id: string, renderer: unknown) => void; }) => {
  context.registerPluginComponent?.('example_panel', () => null);
};
`,
        'utf8'
      );
    },
    async (pluginsRoot) => {
      const scorecard = await scorePluginMaturity({
        manifest: baseManifest,
        validationIssues: [],
        pluginDirectoryName: 'example-plugin',
        pluginsRoot,
      });

      assert.ok(
        scorecard.reasons.every(
          (reason) =>
            !reason.includes(
              'could not be resolved from plugin-local files, shared components, or runtime registration'
            )
        )
      );
      assert.ok(
        scorecard.reasons.every(
          (reason) =>
            !reason.includes('does not register all manifest component ids') &&
            !reason.includes('do not map to checked-in UI modules')
        )
      );
    }
  );
});

test('scorePluginMaturity accepts plugin-local component files as component evidence', async () => {
  await withPluginFixture(
    async (pluginsRoot) => {
      await mkdir(
        path.join(pluginsRoot, 'example-plugin', 'src', 'components'),
        { recursive: true }
      );
      await writeFile(
        path.join(pluginsRoot, 'example-plugin', 'src', 'index.ts'),
        `export const initPlugin = (context: { registerPluginComponent?: (id: string, renderer: unknown) => void; }) => {
  context.registerPluginComponent?.('example_panel', () => null);
};
`,
        'utf8'
      );
      await writeFile(
        path.join(
          pluginsRoot,
          'example-plugin',
          'src',
          'components',
          'example-panel.tsx'
        ),
        `export function ExamplePanel() {
  return null;
}
`,
        'utf8'
      );
    },
    async (pluginsRoot) => {
      const scorecard = await scorePluginMaturity({
        manifest: baseManifest,
        validationIssues: [],
        pluginDirectoryName: 'example-plugin',
        pluginsRoot,
      });

      assert.ok(
        scorecard.reasons.every(
          (reason) =>
            !reason.includes(
              'could not be resolved from plugin-local files, shared components, or runtime registration'
            )
        )
      );
    }
  );
});

test('scorePluginMaturity warns when declared component has no local, shared, or runtime evidence', async () => {
  await withPluginFixture(
    async (pluginsRoot) => {
      await mkdir(path.join(pluginsRoot, 'example-plugin', 'src'), {
        recursive: true,
      });
      await writeFile(
        path.join(pluginsRoot, 'example-plugin', 'src', 'index.ts'),
        `export const initPlugin = () => {
  return null;
};
`,
        'utf8'
      );
    },
    async (pluginsRoot) => {
      const scorecard = await scorePluginMaturity({
        manifest: baseManifest,
        validationIssues: [],
        pluginDirectoryName: 'example-plugin',
        pluginsRoot,
      });

      assert.ok(
        scorecard.reasons.some((reason) =>
          reason.includes(
            'could not be resolved from plugin-local files, shared components, or runtime registration'
          )
        )
      );
      assert.ok(
        scorecard.nextActions.some((action) =>
          action.includes(
            'For each declared component, add plugins/<id>/src/components/<component>.tsx, add src/components/<component>.tsx, or register it in plugins/<id>/src/index.ts.'
          )
        )
      );
    }
  );
});

test('scorePluginMaturity counts src/lib/tags/service.test.ts as evidence for tag-manager', async () => {
  const tagManagerManifest: PluginManifest = {
    ...baseManifest,
    id: 'tag-manager',
    uiExtensions: [
      {
        type: 'dashboard_tab',
        id: 'tag-manager-dashboard-tab',
        title: 'Tag Manager',
        config: {
          tabId: 'tag-manager',
          headerTitle: 'Tags',
          component: 'tag_manager',
        },
      },
    ],
    capabilities: ['tag_mutation'],
  };

  await withPluginFixture(
    async (pluginsRoot, repoRoot) => {
      await mkdir(path.join(pluginsRoot, 'tag-manager', 'src'), {
        recursive: true,
      });
      await writeFile(
        path.join(pluginsRoot, 'tag-manager', 'src', 'index.ts'),
        `export const initPlugin = (context: { register?: (id: string) => void; registerPluginComponent?: (id: string, renderer: unknown) => void; }) => {
  context.register?.('tag-manager-dashboard-tab');
  context.registerPluginComponent?.('tag_manager', () => null);
};
`,
        'utf8'
      );
      await mkdir(path.join(repoRoot, 'src', 'components'), {
        recursive: true,
      });
      await writeFile(
        path.join(repoRoot, 'src', 'components', 'tag-manager.tsx'),
        `export function TagManager() {
  return null;
}
`,
        'utf8'
      );
      await mkdir(path.join(repoRoot, 'src', 'lib', 'tags'), {
        recursive: true,
      });
      await writeFile(
        path.join(repoRoot, 'src', 'lib', 'tags', 'service.test.ts'),
        `test('tag service supports plugin capability', () => {
  'tag_mutation';
});
`,
        'utf8'
      );
    },
    async (pluginsRoot) => {
      const scorecard = await scorePluginMaturity({
        manifest: tagManagerManifest,
        validationIssues: [],
        pluginDirectoryName: 'tag-manager',
        pluginsRoot,
      });

      assert.ok(
        scorecard.reasons.every(
          (reason) =>
            !reason.includes('No plugin-specific automated test evidence')
        )
      );
      assert.ok(scorecard.categoryScores.test_coverage.earned >= 12);
    }
  );
});

test('scorePluginMaturity accepts explicit ux evidence without heuristic keywords in tests', async () => {
  await withPluginFixture(
    async (pluginsRoot, repoRoot) => {
      await mkdir(path.join(pluginsRoot, 'example-plugin', 'src'), {
        recursive: true,
      });
      await writeFile(
        path.join(pluginsRoot, 'example-plugin', 'src', 'index.ts'),
        `export const initPlugin = (context: { register?: (id: string) => void; registerPluginComponent?: (id: string, renderer: unknown) => void; }) => {
  context.register?.('example-dashboard-tab');
  context.registerPluginComponent?.('example_panel', () => null);
};
`,
        'utf8'
      );
      await writeFile(
        path.join(pluginsRoot, 'example-plugin', 'README.md'),
        '## Usage\n\nRun it.\n\n## Verification\n\nnode --test\n',
        'utf8'
      );
      await mkdir(path.join(repoRoot, 'src', 'components'), {
        recursive: true,
      });
      await writeFile(
        path.join(repoRoot, 'src', 'components', 'example-panel.tsx'),
        `export function ExamplePanel() {
  return null;
}
`,
        'utf8'
      );
      await writeFile(
        path.join(repoRoot, 'src', 'components', 'example-panel.test.tsx'),
        `import test from 'node:test';
import assert from 'node:assert/strict';

test('example panel behavior', () => {
  assert.equal(true, true);
});
`,
        'utf8'
      );
    },
    async (pluginsRoot) => {
      const scorecard = await scorePluginMaturity({
        manifest: {
          ...baseManifest,
          maturity: {
            tier: 'silver',
            notes: 'Reviewed with explicit evidence.',
            lastReviewedAt: '2026-03-29',
            uxCriteria: {
              loadingStatePresent: true,
            },
            evidence: {
              testFiles: ['src/components/example-panel.test.tsx'],
              uxCriteria: {
                loadingStatePresent: ['src/components/example-panel.test.tsx'],
              },
            },
          },
        },
        validationIssues: [],
        pluginDirectoryName: 'example-plugin',
        pluginsRoot,
      });

      assert.equal(
        scorecard.verificationDetails.uxCriteria.loadingStatePresent.source,
        'explicit'
      );
      assert.equal(
        scorecard.verificationDetails.uxCriteria.loadingStatePresent.verified,
        true
      );
      assert.ok(scorecard.categoryScores.feature_quality.earned >= 17);
    }
  );
});

test('scorePluginMaturity exposes heuristic verification details when explicit evidence is absent', async () => {
  await withPluginFixture(
    async (pluginsRoot, repoRoot) => {
      await mkdir(path.join(pluginsRoot, 'example-plugin', 'src'), {
        recursive: true,
      });
      await writeFile(
        path.join(pluginsRoot, 'example-plugin', 'src', 'index.ts'),
        `export const initPlugin = (context: { register?: (id: string) => void; registerPluginComponent?: (id: string, renderer: unknown) => void; }) => {
  context.register?.('example-dashboard-tab');
  context.registerPluginComponent?.('example_panel', () => null);
};
`,
        'utf8'
      );
      await writeFile(
        path.join(pluginsRoot, 'example-plugin', 'README.md'),
        '## Usage\n\nRun it.\n\n## Verification\n\nnode --test\n',
        'utf8'
      );
      await mkdir(path.join(repoRoot, 'src', 'components'), {
        recursive: true,
      });
      await writeFile(
        path.join(repoRoot, 'src', 'components', 'example-panel.tsx'),
        `export function ExamplePanel() {
  return null;
}
`,
        'utf8'
      );
      await writeFile(
        path.join(repoRoot, 'src', 'components', 'example-panel.test.tsx'),
        `import test from 'node:test';
import assert from 'node:assert/strict';

test('example panel loading state', () => {
  assert.match('loading spinner', /loading/);
});
`,
        'utf8'
      );
    },
    async (pluginsRoot) => {
      const scorecard = await scorePluginMaturity({
        manifest: {
          ...baseManifest,
          maturity: {
            tier: 'bronze',
            notes: 'Reviewed with fallback evidence.',
            lastReviewedAt: '2026-03-29',
            uxCriteria: {
              loadingStatePresent: true,
            },
          },
        },
        validationIssues: [],
        pluginDirectoryName: 'example-plugin',
        pluginsRoot,
      });

      assert.equal(scorecard.verificationDetails.testEvidenceSource, 'heuristic');
      assert.equal(
        scorecard.verificationDetails.uxCriteria.loadingStatePresent.source,
        'heuristic'
      );
    }
  );
});
