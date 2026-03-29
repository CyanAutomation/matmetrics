import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { deriveClearOutcome, deriveDisableOutcome } from './github-settings-view-model';

const githubSettingsSource = readFileSync(
  path.join(process.cwd(), 'src', 'components', 'github-settings.tsx'),
  'utf8'
);

test('destructive confirm/confirmation path exists for disable action', () => {
  assert.match(
    githubSettingsSource,
    /onClick=\{\(\) => void handleDisable\(\)\}[\s\S]*?variant="outline"[\s\S]*?Disable Sync/i,
    'destructive confirmation action should expose disable control'
  );
});

test('destructive confirm/confirmation path exists for clear action dialog', () => {
  assert.match(
    githubSettingsSource,
    /DialogTitle>Clear GitHub configuration\?[\s\S]*?onClick=\{\(\) => void handleClear\(\)\}[\s\S]*?Clear Configuration/i,
    'destructive confirmation action should require clear dialog confirmation'
  );
});

test('destructive cancel/undo path closes dialog and preserves prior values', () => {
  assert.match(
    githubSettingsSource,
    /onClick=\{\(\) => setIsClearDialogOpen\(false\)\}[\s\S]*?>\s*Cancel\s*</i,
    'cancel/undo should close destructive dialog'
  );

  const baseState = {
    owner: 'cyan-automation',
    repo: 'judo-notes',
    branch: 'main',
    isEnabled: true,
    migrationDone: true,
    isClearDialogOpen: true,
    testResult: { success: true, message: 'Connected' },
  };

  const disableOutcome = deriveDisableOutcome(baseState);

  assert.equal(disableOutcome.owner, baseState.owner, 'cancel/undo preserve owner');
  assert.equal(disableOutcome.repo, baseState.repo, 'cancel/undo preserve repo');
  assert.equal(disableOutcome.branch, baseState.branch, 'cancel/undo preserve branch');
  assert.equal(disableOutcome.isEnabled, false, 'destructive disable toggles enabled state');

  const clearOutcome = deriveClearOutcome(baseState);
  assert.equal(clearOutcome.owner, '', 'destructive confirm clears owner');
  assert.equal(clearOutcome.isClearDialogOpen, false, 'destructive confirm closes dialog');
});
