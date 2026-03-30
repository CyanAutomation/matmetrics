import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluatePluginComponentCompositionFromSource } from '../scripts/validate-plugin-ui-contract';

test('composition conformance passes for a sectioned dashboard shell with destructive flow wrapper', () => {
  const source = `
    import { PluginPageShell } from '@/components/plugins/plugin-page-shell';
    import { PluginFormSection } from '@/components/plugins/plugin-kit';
    import { PluginDestructiveAction } from '@/components/plugins/plugin-destructive-action';

    export function PassingFixture() {
      return (
        <PluginPageShell title="Fixture">
          <PluginFormSection title="Primary">Body</PluginFormSection>
          <PluginDestructiveAction
            title="Danger"
            description="Delete"
            triggerLabel="Delete"
            onConfirm={() => Promise.resolve()}
          />
        </PluginPageShell>
      );
    }
  `;

  assert.deepEqual(evaluatePluginComponentCompositionFromSource(source), {
    hasSingleTopLevelPageShell: true,
    hasPrimaryContentSections: true,
    hasDestructiveFlowComposition: true,
  });
});

test('composition conformance fails when layout is not shell-rooted, not sectioned, and uses raw destructive button', () => {
  const source = `
    import { PluginPageShell } from '@/components/plugins/plugin-page-shell';

    export function FailingFixture() {
      return (
        <div>
          <PluginPageShell title="Nested shell">content</PluginPageShell>
          <button className="text-red-600">Delete everything</button>
        </div>
      );
    }
  `;

  assert.deepEqual(evaluatePluginComponentCompositionFromSource(source), {
    hasSingleTopLevelPageShell: false,
    hasPrimaryContentSections: false,
    hasDestructiveFlowComposition: false,
  });
});
