export function getGitHubBackupReturnTab(search: string): 'github-sync' | null {
  const result = new URLSearchParams(search).get('githubBackup');
  return result === 'connected' || result === 'failed' ? 'github-sync' : null;
}
