import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getGitHubBackupReturn,
  removeGitHubBackupReturn,
} from './github-backup-return';

test('GitHub installation callback returns users to the Backup tab', () => {
  assert.deepEqual(getGitHubBackupReturn('?githubBackup=connected'), {
    tab: 'github-sync',
    result: 'connected',
  });
  assert.deepEqual(getGitHubBackupReturn('?githubBackup=failed'), {
    tab: 'github-sync',
    result: 'failed',
  });
  assert.equal(getGitHubBackupReturn('?githubBackup=pending'), null);
  assert.equal(getGitHubBackupReturn(''), null);
});

test('removes only the callback result from the URL and preserves other navigation state', () => {
  const originalUrl = new URL(
    'https://matmetrics.example.test/?githubBackup=connected&tab=history#sessions'
  );
  const result = removeGitHubBackupReturn(originalUrl);

  assert.equal(result.toString(), 'https://matmetrics.example.test/?tab=history#sessions');
  assert.equal(originalUrl.searchParams.get('githubBackup'), 'connected');
});
