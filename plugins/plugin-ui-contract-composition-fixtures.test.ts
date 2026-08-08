import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { evaluatePluginComponentCompositionFromSource } from '../scripts/validate-plugin-ui-contract';

const repoRoot = process.cwd();
const REQUIREMENT_SOURCES = {
  compositionEntrypoint: 'docs/blueprint.md#plugin-page-composition',
  parserDetachedBlocksGuard: 'bug:BUG-344',
} as const;

const req = (key: keyof typeof REQUIREMENT_SOURCES): string =>
  `[req:${REQUIREMENT_SOURCES[key]}]`;

type PluginCompositionFixture = {
  pluginId: string;
  sourcePath: string;
};

const pluginCompositionFixtures: PluginCompositionFixture[] = [
  {
    pluginId: 'github-sync',
    sourcePath: 'plugins/github-sync/src/components/github-settings-panel.tsx',
  },
  {
    pluginId: 'prompt-settings',
    sourcePath: 'plugins/prompt-settings/src/components/prompt-settings.tsx',
  },
  {
    pluginId: 'tag-manager',
    sourcePath: 'plugins/tag-manager/src/components/tag-manager-panel.tsx',
  },
  {
    pluginId: 'video-library',
    sourcePath: 'plugins/video-library/src/components/video-library-panel.tsx',
  },
  {
    pluginId: 'log-doctor',
    sourcePath: 'plugins/log-doctor/src/components/log-doctor-panel.tsx',
  },
];

for (const fixture of pluginCompositionFixtures) {
  test(`${fixture.pluginId} component entrypoint satisfies composition contract`, () => {
    const source = readFileSync(path.join(repoRoot, fixture.sourcePath), 'utf8');

    assert.deepEqual(
      evaluatePluginComponentCompositionFromSource(source),
      {
        hasSingleTopLevelPageShell: true,
        hasPrimaryContentSections: true,
        hasDestructiveFlowComposition: true,
      },
      `${req('compositionEntrypoint')} [${fixture.pluginId}] expected composition contract in ${fixture.sourcePath}`
    );
  });
}

test('synthetic parser edge case: composition fails when required blocks are outside PluginPageShell', () => {
  const source = `
    import { PluginPageShell } from '@/components/plugins/plugin-page-shell';
    import { PluginFormSection } from '@/components/plugins/plugin-kit';
    import { PluginConfirmationDialog } from '@/components/plugins/plugin-confirmation';

    export function FailingFixtureWithDetachedBlocks() {
      return (
        <>
          <PluginPageShell title="Detached">Body</PluginPageShell>
          <PluginFormSection title="Outside shell">Not grouped in shell</PluginFormSection>
          <PluginConfirmationDialog open={false} onOpenChange={() => {}} title="Confirm" description="Danger" confirmLabel="Confirm" />
        </>
      );
    }
  `;

  assert.deepEqual(
    evaluatePluginComponentCompositionFromSource(source),
    {
      hasSingleTopLevelPageShell: false,
      hasPrimaryContentSections: false,
      hasDestructiveFlowComposition: false,
    },
    `${req('parserDetachedBlocksGuard')} detached blocks outside PluginPageShell must fail contract`
  );
});
