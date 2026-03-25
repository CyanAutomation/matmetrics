import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { scorePluginMaturity } from '@/lib/plugins/maturity';
import type {
  PluginManifest,
  PluginValidationIssue,
} from '@/lib/plugins/types';

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
      assert.ok(
        scorecard.reasons.some((reason) =>
          reason.includes('cap the plugin at Bronze')
        )
      );
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
        `test('example panel renders', () => {
  'example-panel';
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

test('scorePluginMaturity treats missing component file as docs-quality warning when registration exists', async () => {
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
        scorecard.reasons.some((reason) =>
          reason.includes(
            'Some registered plugin component UI modules are missing from src/components.'
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
