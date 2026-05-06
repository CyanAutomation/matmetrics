import assert from 'node:assert/strict';
import test from 'node:test';

import promptSettingsManifest from './plugin.json';

test('prompt-settings manifest declares the expected dashboard tab copy and icon', () => {
  const dashboardTab = promptSettingsManifest.uiExtensions.find(
    (extension) => extension.type === 'dashboard_tab'
  );

  assert.ok(dashboardTab, 'expected a dashboard_tab extension');
  assert.equal(dashboardTab.title, 'Prompt Settings');
  assert.equal(dashboardTab.config.headerTitle, 'AI Prompt Configuration');
  assert.equal(dashboardTab.config.icon, 'brain');
});

test('prompt-settings manifest evidence tracks prompt settings UX coverage', () => {
  assert.deepEqual(promptSettingsManifest.uiContract.requiredUxStates, [
    'loading',
    'error',
    'empty',
    'destructive',
  ]);
  assert.deepEqual(
    promptSettingsManifest.maturity.evidence.uxCriteria.loadingStatePresent,
    ['plugins/prompt-settings/src/components/prompt-settings.test.tsx']
  );
  assert.deepEqual(
    promptSettingsManifest.maturity.evidence.uxCriteria.errorStateWithRecovery,
    ['plugins/prompt-settings/src/components/prompt-settings.test.tsx']
  );
  assert.deepEqual(
    promptSettingsManifest.maturity.evidence.uxCriteria.emptyStateWithCta,
    ['plugins/prompt-settings/src/components/prompt-settings.test.tsx']
  );
  assert.deepEqual(
    promptSettingsManifest.maturity.evidence.uxCriteria.destructiveActionSafety,
    ['plugins/prompt-settings/src/components/prompt-settings.test.tsx']
  );
});
