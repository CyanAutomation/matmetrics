import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { scorePluginMaturity } from '@/lib/plugins/maturity';
import { validatePluginManifest } from '@/lib/plugins/validate';
import githubSyncManifest from '../../../plugins/github-sync/plugin.json';
import promptSettingsManifest from '../../../plugins/prompt-settings/plugin.json';

const pluginsRoot = path.join(process.cwd(), 'plugins');

test('github-sync maturity regression keeps machine-checkable ux criteria satisfied', async () => {
  const validation = validatePluginManifest(githubSyncManifest);
  assert.equal(validation.isValid, true);
  if (!validation.isValid) {
    return;
  }
  const scorecard = await scorePluginMaturity({
    manifest: validation.manifest,
    validationIssues: validation.issues,
    pluginDirectoryName: 'github-sync',
    pluginsRoot,
  });

  assert.equal(
    scorecard.reasons.some((reason) =>
      reason.includes('Missing machine-checkable UX criterion')
    ),
    false
  );
  assert.equal(scorecard.tier, 'silver');
  assert.ok(scorecard.score >= 70);
});

test('prompt-settings maturity regression keeps machine-checkable ux criteria satisfied', async () => {
  const validation = validatePluginManifest(promptSettingsManifest);
  assert.equal(validation.isValid, true);
  if (!validation.isValid) {
    return;
  }
  const scorecard = await scorePluginMaturity({
    manifest: validation.manifest,
    validationIssues: validation.issues,
    pluginDirectoryName: 'prompt-settings',
    pluginsRoot,
  });

  assert.equal(
    scorecard.reasons.some((reason) =>
      reason.includes('Missing machine-checkable UX criterion')
    ),
    false
  );
  assert.equal(scorecard.tier, 'silver');
  assert.ok(scorecard.score >= 70);
});
