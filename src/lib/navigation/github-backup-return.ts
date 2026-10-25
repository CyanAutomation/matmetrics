export type GitHubBackupResult = 'connected' | 'failed';

export type GitHubBackupReturn = {
  tab: 'github-sync';
  result: GitHubBackupResult;
};

export function getGitHubBackupReturn(
  search: string
): GitHubBackupReturn | null {
  const result = new URLSearchParams(search).get('githubBackup');
  return result === 'connected' || result === 'failed'
    ? { tab: 'github-sync', result }
    : null;
}

export function removeGitHubBackupReturn(url: URL): URL {
  const cleanedUrl = new URL(url.toString());
  cleanedUrl.searchParams.delete('githubBackup');
  return cleanedUrl;
}
