import type { GitHubConfig } from './types';

export type GitHubHealthResult = {
  success: boolean;
  message: string;
  branch: string;
  checkedAt: string;
  rateLimit?: {
    limit: number;
    remaining: number;
    resetAt?: string;
  };
};

const GITHUB_REQUEST_TIMEOUT_MS = 10_000;

export async function checkGitHubHealth(
  config: GitHubConfig
): Promise<GitHubHealthResult> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('GitHub repository access is not configured for this deployment');
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    GITHUB_REQUEST_TIMEOUT_MS
  );
  let response: Response;
  try {
    response = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`,
      {
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'matmetrics',
        },
        cache: 'no-store',
        signal: controller.signal,
      }
    );
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('GitHub API request timed out');
    }
    if (error instanceof TypeError) {
      throw new Error('GitHub could not be reached. Please try again shortly.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  const payload = (await response.json().catch(() => null)) as {
    message?: unknown;
    default_branch?: unknown;
  } | null;
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `GitHub rejected repository access (${response.status}). Check that the repository connection is still authorized.`
      );
    }
    if (response.status >= 500) {
      throw new Error(
        `GitHub is temporarily unavailable (${response.status}). Please try again later.`
      );
    }
    const detail =
      typeof payload?.message === 'string'
        ? payload.message
        : response.statusText;
    throw new Error(`GitHub API error ${response.status}: ${detail}`);
  }
  const branch = config.branch?.trim() || payload?.default_branch;
  if (typeof branch !== 'string' || !branch.trim()) {
    throw new Error('GitHub repository does not expose a default branch');
  }
  const limit = Number(response.headers.get('x-ratelimit-limit'));
  const remaining = Number(response.headers.get('x-ratelimit-remaining'));
  const resetSeconds = Number(response.headers.get('x-ratelimit-reset'));
  const rateLimit =
    Number.isFinite(limit) && Number.isFinite(remaining)
      ? {
          limit,
          remaining,
          ...(Number.isFinite(resetSeconds)
            ? { resetAt: new Date(resetSeconds * 1000).toISOString() }
            : {}),
        }
      : undefined;
  return {
    success: true,
    message: `Successfully connected to ${config.owner}/${config.repo} on branch ${branch}`,
    branch,
    checkedAt: new Date().toISOString(),
    ...(rateLimit ? { rateLimit } : {}),
  };
}
