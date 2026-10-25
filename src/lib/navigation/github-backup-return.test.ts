import assert from 'node:assert/strict';
import test from 'node:test';
import { getGitHubBackupReturnTab } from './github-backup-return';

test('GitHub installation callback returns users to the Backup tab', () => {
  assert.equal(getGitHubBackupReturnTab('?githubBackup=connected'), 'github-sync');
  assert.equal(getGitHubBackupReturnTab('?githubBackup=failed'), 'github-sync');
  assert.equal(getGitHubBackupReturnTab('?githubBackup=pending'), null);
  assert.equal(getGitHubBackupReturnTab(''), null);
});
