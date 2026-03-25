import assert from 'node:assert/strict';
import test from 'node:test';

import githubSyncManifest from './plugin.json';

test('github-sync manifest includes required metadata fields', () => {
  assert.equal(githubSyncManifest.id, 'github-sync');
  assert.equal(githubSyncManifest.name, 'GitHub Sync Plugin');
  assert.equal(githubSyncManifest.version, '1.0.0');
  assert.equal(typeof githubSyncManifest.description, 'string');
  assert.equal(githubSyncManifest.enabled, true);
});

test('github-sync manifest dashboard ui extension points to github_settings', () => {
  const extension = githubSyncManifest.uiExtensions.find(
    (candidate) => candidate.id === 'github-sync-dashboard-tab'
  );

  assert.ok(extension, 'Expected github-sync-dashboard-tab extension.');
  assert.equal(extension.type, 'dashboard_tab');
  assert.equal(extension.config.component, 'github_settings');
});
