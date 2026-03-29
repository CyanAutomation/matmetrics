import { JudoSession } from './types';
import { sessionToMarkdown } from './markdown-serializer';

export interface GitHubConfig {
  owner: string;
  repo: string;
  branch?: string;
}

export interface GitHubSyncResult {
  success: boolean;
  message: string;
  filePath?: string;
  sha?: string;
  branch?: string;
}

interface DefaultBranchCacheEntry {
  branch: string;
  cachedAt: number;
}

const DEFAULT_BRANCH_CACHE_TTL_MS = 5 * 60 * 1000;
const defaultBranchCache = new Map<string, DefaultBranchCacheEntry>();
const GITHUB_SESSION_ROOT = 'data';

interface GitHubTreeEntry {
  path: string;
  type: 'blob' | 'tree' | 'commit';
}

class GitHubApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'GitHubApiError';
  }
}

function isGitHubApiError(error: unknown): error is GitHubApiError {
  return error instanceof GitHubApiError;
}

function getActionableGitHubErrorMessage(
  action: string,
  error: unknown
): string {
  if (error instanceof GitHubApiError) {
    if (error.status === 401) {
      return `${action} failed: GitHub authentication failed (401). Verify GITHUB_TOKEN is valid and has repository access.`;
    }

    if (error.status === 403) {
      return `${action} failed: GitHub access is forbidden (403). Check token permissions and repository visibility.`;
    }

    if (error.status === 429) {
      return `${action} failed: GitHub API rate limit exceeded (429). Retry later or use a higher quota token.`;
    }

    if (error.status >= 500) {
      return `${action} failed: GitHub service error (${error.status}). Retry in a few minutes.`;
    }

    return `${action} failed: ${error.message}`;
  }

  if (error instanceof Error) {
    return `${action} failed: ${error.message}`;
  }

  return `${action} failed due to an unknown error`;
}

function validateSessionIdLength(sessionId: string): void {
  if (sessionId.length > 100) {
    throw new Error(
      'Session ID exceeds maximum allowed length of 100 characters'
    );
  }
}

function encodeSessionId(sessionId: string): string {
  validateSessionIdLength(sessionId);
  return encodeURIComponent(sessionId);
}

function getTokenFingerprint(token: string): string {
  let hash = 0;

  for (let index = 0; index < token.length; index++) {
    hash = (hash * 31 + token.charCodeAt(index)) >>> 0;
  }

  return hash.toString(16);
}

function getDefaultBranchCacheKey(owner: string, repo: string): string {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('GITHUB_TOKEN environment variable not set');
  }
  return `${owner}/${repo}/${getTokenFingerprint(token)}`;
}

function invalidateDefaultBranchCache(owner: string, repo: string): void {
  defaultBranchCache.delete(getDefaultBranchCacheKey(owner, repo));
}

export function __resetDefaultBranchCacheForTests(): void {
  defaultBranchCache.clear();
}

/**
 * Get the file path for a session in GitHub
 * Format: data/YYYY/MM/YYYYMMDD-matmetrics-{id}.md
 */
export function getGitHubSessionPath(session: JudoSession): string {
  const [year, month, day] = session.date.split('-');
  const fileName = `${year}${month}${day}-matmetrics-${encodeSessionId(session.id)}.md`;
  return `${GITHUB_SESSION_ROOT}/${year}/${month}/${fileName}`;
}

/**
 * Check if GitHub is configured (token exists)
 */
export function isGitHubConfigured(): boolean {
  return !!process.env.GITHUB_TOKEN;
}

/**
 * Make authenticated request to GitHub API
 */
async function githubApiRequest(
  method: string,
  path: string,
  body?: unknown
): Promise<any> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('GITHUB_TOKEN environment variable not set');
  }

  const url = `https://api.github.com${path}`;

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'matmetrics',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    const errorMessage =
      errorData && typeof errorData.message === 'string'
        ? errorData.message
        : response.statusText;

    throw new GitHubApiError(
      `GitHub API error ${response.status}: ${errorMessage}`,
      response.status
    );
  }

  return response.json();
}

/**
 * Get SHA of existing file for update operations
 */
async function getFileSha(
  owner: string,
  repo: string,
  path: string,
  branch: string
): Promise<string | null> {
  try {
    const data = await githubApiRequest(
      'GET',
      `/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`
    );
    return data.sha;
  } catch (error) {
    if (!isGitHubApiError(error)) {
      throw error;
    }

    if (error.status === 404) {
      // File doesn't exist
      return null;
    }

    throw error;
  }
}

async function getFileContent(
  owner: string,
  repo: string,
  path: string,
  branch: string
): Promise<string | null> {
  try {
    const data = await githubApiRequest(
      'GET',
      `/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`
    );

    if (typeof data?.content !== 'string') {
      throw new Error(
        `GitHub contents response for ${path} did not include file content`
      );
    }

    return Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString(
      'utf8'
    );
  } catch (error) {
    if (!isGitHubApiError(error)) {
      throw error;
    }

    if (error.status === 404) {
      return null;
    }

    throw error;
  }
}

async function getTreeEntriesForPath(
  owner: string,
  repo: string,
  branch: string,
  rootPath: string
): Promise<GitHubTreeEntry[]> {
  try {
    const refData = await githubApiRequest(
      'GET',
      `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`
    );

    const commitSha = refData?.object?.sha;
    if (typeof commitSha !== 'string' || commitSha.trim() === '') {
      throw new Error('Branch reference does not include a commit SHA');
    }

    const commitData = await githubApiRequest(
      'GET',
      `/repos/${owner}/${repo}/git/commits/${commitSha}`
    );

    const treeSha = commitData?.tree?.sha;
    if (typeof treeSha !== 'string' || treeSha.trim() === '') {
      throw new Error('Commit does not include a tree SHA');
    }

    const treeData = await githubApiRequest(
      'GET',
      `/repos/${owner}/${repo}/git/trees/${treeSha}?recursive=1`
    );

    if (treeData?.truncated === true) {
      return listTreeEntriesFromContentsApi(owner, repo, branch, rootPath);
    }

    if (!Array.isArray(treeData?.tree)) {
      return [];
    }

    const prefix = `${rootPath.replace(/\/+$/, '')}/`;

    return treeData.tree.filter(
      (entry: GitHubTreeEntry) =>
        typeof entry?.path === 'string' && entry.path.startsWith(prefix)
    );
  } catch (error) {
    if (isGitHubApiError(error)) {
      if (error.status === 404) {
        return [];
      }
      throw error;
    }

    throw error;
  }
}

interface GitHubContentsEntry {
  path: string;
  type: 'file' | 'dir';
}

async function listTreeEntriesFromContentsApi(
  owner: string,
  repo: string,
  branch: string,
  rootPath: string
): Promise<GitHubTreeEntry[]> {
  const normalizedRootPath = rootPath.replace(/^\/+|\/+$/g, '');
  const queue = [normalizedRootPath];
  const treeEntries: GitHubTreeEntry[] = [];

  while (queue.length > 0) {
    const currentPath = queue.shift();
    if (!currentPath) {
      continue;
    }

    let contents: GitHubContentsEntry[];
    try {
      const data = await githubApiRequest(
        'GET',
        `/repos/${owner}/${repo}/contents/${currentPath}?ref=${encodeURIComponent(branch)}`
      );
      contents = Array.isArray(data) ? data : [];
    } catch (error) {
      if (
        isGitHubApiError(error) &&
        error.status === 404 &&
        currentPath === normalizedRootPath
      ) {
        return [];
      }
      throw error;
    }

    for (const item of contents) {
      if (typeof item?.path !== 'string') {
        continue;
      }

      if (item.type === 'dir') {
        queue.push(item.path);
        treeEntries.push({ path: item.path, type: 'tree' });
        continue;
      }

      if (item.type === 'file') {
        treeEntries.push({ path: item.path, type: 'blob' });
      }
    }
  }

  return treeEntries;
}

async function resolveBranch(
  config: GitHubConfig,
  options?: { forceRefresh?: boolean }
): Promise<string> {
  if (config.branch?.trim()) {
    return config.branch.trim();
  }

  const cacheKey = getDefaultBranchCacheKey(config.owner, config.repo);

  if (!options?.forceRefresh) {
    const cachedBranch = defaultBranchCache.get(cacheKey);
    if (cachedBranch) {
      const ageMs = Date.now() - cachedBranch.cachedAt;
      if (ageMs < DEFAULT_BRANCH_CACHE_TTL_MS) {
        return cachedBranch.branch;
      }

      defaultBranchCache.delete(cacheKey);
    }
  }

  try {
    const repoData = await githubApiRequest(
      'GET',
      `/repos/${config.owner}/${config.repo}`
    );
    const defaultBranch = repoData?.default_branch;

    if (typeof defaultBranch !== 'string' || defaultBranch.trim() === '') {
      throw new Error('Repository default branch is unavailable');
    }

    defaultBranchCache.set(cacheKey, {
      branch: defaultBranch,
      cachedAt: Date.now(),
    });
    return defaultBranch;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    throw new Error(
      `Unable to resolve repository branch for ${config.owner}/${config.repo}: ${errorMessage}`
    );
  }
}

function isInvalidBranchWriteError(error: unknown): boolean {
  if (!isGitHubApiError(error)) {
    return false;
  }

  if (error.status !== 404 && error.status !== 422) {
    return false;
  }

  const normalizedMessage = error.message.toLowerCase();

  return (
    normalizedMessage.includes('branch') ||
    normalizedMessage.includes('ref') ||
    normalizedMessage.includes('no commit found')
  );
}

async function githubDeleteWithBranchRetry(
  config: GitHubConfig,
  filePath: string,
  body: { message: string; branch: string; sha: string }
): Promise<any> {
  const requestDelete = async (branch: string) =>
    githubApiRequest(
      'DELETE',
      `/repos/${config.owner}/${config.repo}/contents/${filePath}`,
      { ...body, branch }
    );

  try {
    return await requestDelete(body.branch);
  } catch (error) {
    if (isInvalidBranchWriteError(error) && !config.branch?.trim()) {
      invalidateDefaultBranchCache(config.owner, config.repo);
      const refreshedBranch = await resolveBranch(config, { forceRefresh: true });
      return requestDelete(refreshedBranch);
    }

    throw error;
  }
}

/**
 * Find a session file path in GitHub by session ID by scanning data/YYYY/MM folders.
 */
export async function findSessionPathOnGitHubById(
  sessionId: string,
  config: GitHubConfig
): Promise<string | null> {
  const branch = await resolveBranch(config);
  const encodedSuffix = `-matmetrics-${encodeSessionId(sessionId)}.md`;
  const sessionEntries = await getTreeEntriesForPath(
    config.owner,
    config.repo,
    branch,
    GITHUB_SESSION_ROOT
  );

  for (const entry of sessionEntries) {
    if (entry.type !== 'blob') {
      continue;
    }

    const pathParts = entry.path.split('/');
    if (pathParts.length !== 4) {
      continue;
    }

    const [rootDir, year, month, fileName] = pathParts;
    if (
      rootDir !== GITHUB_SESSION_ROOT ||
      !/^\d{4}$/.test(year) ||
      !/^\d{2}$/.test(month)
    ) {
      continue;
    }

    if (fileName.endsWith(encodedSuffix)) {
      return entry.path;
    }
  }

  return null;
}

/**
 * Create or update a file in GitHub
 */
async function putFile(
  config: GitHubConfig,
  path: string,
  content: string,
  message: string,
  sha?: string | null
): Promise<GitHubSyncResult> {
  try {
    const contentBase64 = Buffer.from(content).toString('base64');
    let branch = await resolveBranch(config);

    const writeFile = async (resolvedBranch: string) => {
      const body = {
        message,
        content: contentBase64,
        branch: resolvedBranch,
        ...(sha && { sha }),
      };

      return githubApiRequest(
        'PUT',
        `/repos/${config.owner}/${config.repo}/contents/${path}`,
        body
      );
    };

    let data;
    try {
      data = await writeFile(branch);
    } catch (error) {
      if (isInvalidBranchWriteError(error) && !config.branch?.trim()) {
        invalidateDefaultBranchCache(config.owner, config.repo);
        branch = await resolveBranch(config, { forceRefresh: true });
        data = await writeFile(branch);
      } else {
        throw error;
      }
    }

    return {
      success: true,
      message: sha ? 'Session updated on GitHub' : 'Session created on GitHub',
      filePath: path,
      sha: data.content?.sha || data.sha,
      branch,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      message: `GitHub sync failed: ${errorMessage}`,
    };
  }
}

/**
 * Create a new session file in GitHub
 */
export async function createSessionOnGitHub(
  session: JudoSession,
  config: GitHubConfig
): Promise<GitHubSyncResult> {
  try {
    const branch = await resolveBranch(config);
    const filePath = getGitHubSessionPath(session);
    const markdown = sessionToMarkdown(session);
    const message = `Add session: ${session.date}`;
    const existingContent = await getFileContent(
      config.owner,
      config.repo,
      filePath,
      branch
    );

    if (existingContent !== null) {
      if (existingContent === markdown) {
        const sha = await getFileSha(
          config.owner,
          config.repo,
          filePath,
          branch
        );
        return {
          success: true,
          message: 'Session already exists on GitHub',
          filePath,
          sha: sha ?? undefined,
          branch,
        };
      }

      return {
        success: false,
        message: `GitHub session create for ${session.id} failed: ${filePath} already exists with different content`,
      };
    }

    const result = await putFile(config, filePath, markdown, message);
    if (result.success) {
      return result;
    }

    const concurrentContent = await getFileContent(
      config.owner,
      config.repo,
      filePath,
      branch
    );

    if (concurrentContent === markdown) {
      const sha = await getFileSha(config.owner, config.repo, filePath, branch);
      return {
        success: true,
        message: 'Session already exists on GitHub',
        filePath,
        sha: sha ?? undefined,
        branch,
      };
    }

    return result;
  } catch (error) {
    return {
      success: false,
      message: getActionableGitHubErrorMessage(
        `GitHub session create for ${session.id}`,
        error
      ),
    };
  }
}

/**
 * Update an existing session file in GitHub
 */
export async function updateSessionOnGitHub(
  session: JudoSession,
  config: GitHubConfig
): Promise<GitHubSyncResult> {
  try {
    const branch = await resolveBranch(config);
    const expectedPath = getGitHubSessionPath(session);
    const markdown = sessionToMarkdown(session);
    let sha = await getFileSha(config.owner, config.repo, expectedPath, branch);
    let discoveredPath: string | null = null;

    if (!sha) {
      discoveredPath = await findSessionPathOnGitHubById(session.id, config);
      if (discoveredPath) {
        sha = await getFileSha(
          config.owner,
          config.repo,
          discoveredPath,
          branch
        );
      }
    }

    if (!sha) {
      // File doesn't exist yet; create the session file instead.
      const result = await createSessionOnGitHub(session, config);
      if (!result.success) {
        return {
          success: false,
          message: `GitHub session update for ${session.id} failed while creating missing file: ${result.message}`,
        };
      }
      return result;
    }

    if (discoveredPath && discoveredPath !== expectedPath) {
      const createResult = await putFile(
        config,
        expectedPath,
        markdown,
        `Move session: ${session.date}`
      );

      if (!createResult.success) {
        return createResult;
      }

      const deleteResult = await githubDeleteWithBranchRetry(
        config,
        discoveredPath,
        {
          message: `Move session: ${session.date}`,
          branch,
          sha,
        }
      );

      return {
        success: true,
        message: 'Session updated on GitHub',
        filePath: expectedPath,
        sha:
          createResult.sha ?? deleteResult?.content?.sha ?? deleteResult?.sha,
        branch,
      };
    }

    const message = `Update session: ${session.date}`;
    return putFile(config, expectedPath, markdown, message, sha);
  } catch (error) {
    return {
      success: false,
      message: getActionableGitHubErrorMessage(
        `GitHub session update for ${session.id}`,
        error
      ),
    };
  }
}

/**
 * Delete a session file from GitHub
 */
export async function deleteSessionOnGitHub(
  session: JudoSession,
  config: GitHubConfig
): Promise<GitHubSyncResult> {
  try {
    const branch = await resolveBranch(config);
    const expectedPath = getGitHubSessionPath(session);
    let filePath = expectedPath;
    let sha = await getFileSha(config.owner, config.repo, expectedPath, branch);

    if (!sha) {
      const discoveredPath = await findSessionPathOnGitHubById(
        session.id,
        config
      );
      if (discoveredPath) {
        filePath = discoveredPath;
        sha = await getFileSha(
          config.owner,
          config.repo,
          discoveredPath,
          branch
        );
      }
    }

    if (!sha) {
      return {
        success: true,
        message: 'Session not found on GitHub (already deleted)',
      };
    }

    await githubDeleteWithBranchRetry(config, filePath, {
      message: `Delete session: ${session.date}`,
      branch,
      sha,
    });

    return {
      success: true,
      message: 'Session deleted from GitHub',
      filePath,
      branch,
    };
  } catch (error) {
    return {
      success: false,
      message: getActionableGitHubErrorMessage(
        `GitHub session delete for ${session.id}`,
        error
      ),
    };
  }
}

/**
 * Delete a session file from GitHub when only session ID is known.
 */
export async function deleteSessionOnGitHubById(
  sessionId: string,
  config: GitHubConfig
): Promise<GitHubSyncResult> {
  try {
    const branch = await resolveBranch(config);
    const filePath = await findSessionPathOnGitHubById(sessionId, config);

    if (!filePath) {
      return {
        success: true,
        message: 'Session not found on GitHub (already deleted)',
      };
    }

    const sha = await getFileSha(config.owner, config.repo, filePath, branch);
    if (!sha) {
      return {
        success: true,
        message: 'Session not found on GitHub (already deleted)',
      };
    }

    await githubDeleteWithBranchRetry(config, filePath, {
      message: `Delete session by id: ${sessionId}`,
      branch,
      sha,
    });

    return {
      success: true,
      message: 'Session deleted from GitHub',
      filePath,
      branch,
    };
  } catch (error) {
    return {
      success: false,
      message: getActionableGitHubErrorMessage(
        `GitHub session delete for ${sessionId}`,
        error
      ),
    };
  }
}

/**
 * Create or update a README.md in the repo with session stats
 */
export async function createGitHubReadme(
  config: GitHubConfig,
  sessionCount: number,
  latestDate?: string
): Promise<GitHubSyncResult> {
  try {
    const readme = `# Judo Training Log

Generated by [matmetrics](https://github.com/CyanAutomation/matmetrics).

## Statistics

- **Total Sessions**: ${sessionCount}
- **Last Updated**: ${new Date().toISOString()}
${latestDate ? `- **Latest Session**: ${latestDate}` : ''}

## Structure

Sessions are organized by date in \`data/YYYY/MM/\` directories as markdown files.

Each session includes:
- Date and session type (Technical, Randori, or Shiai)
- Effort level (1-5)
- Techniques practiced
- Notes and observations

---

*This repository is automatically synced with matmetrics.*
`;

    const branch = await resolveBranch(config);
    const sha = await getFileSha(
      config.owner,
      config.repo,
      'README.md',
      branch
    );
    return putFile(
      config,
      'README.md',
      readme,
      'Update README with session stats',
      sha
    );
  } catch (error) {
    return {
      success: false,
      message: getActionableGitHubErrorMessage('GitHub README update', error),
    };
  }
}

/**
 * Bulk push all sessions to GitHub
 * Used for initial sync - creates a single commit with all files
 */
export async function bulkPushSessions(
  sessions: JudoSession[],
  config: GitHubConfig
): Promise<GitHubSyncResult> {
  if (sessions.length === 0) {
    return {
      success: true,
      message: 'No sessions to push',
    };
  }

  try {
    // For now, push each session individually
    // In future, could use tree API for true bulk commit
    let successCount = 0;
    let lastError = '';

    for (const session of sessions) {
      const result = await createSessionOnGitHub(session, config);
      if (result.success) {
        successCount++;
      } else {
        lastError = result.message;
      }
    }

    // Caller order must not affect stats; derive latest session date from all entries.
    const latestDate = sessions
      .map((session) => {
        const timestamp = Date.parse(session.date);
        return Number.isNaN(timestamp)
          ? null
          : { date: session.date, timestamp };
      })
      .filter(
        (session): session is { date: string; timestamp: number } =>
          session !== null
      )
      .reduce<{ date: string; timestamp: number } | undefined>(
        (max, session) => {
          if (!max || session.timestamp > max.timestamp) {
            return session;
          }

          return max;
        },
        undefined
      )?.date;

    // Update README with stats
    const readmeResult = await createGitHubReadme(
      config,
      sessions.length,
      latestDate
    );

    const readmeWarning = readmeResult.success
      ? ''
      : ` README update failed: ${readmeResult.message}`;

    return {
      success: lastError === '' && readmeResult.success,
      message: `Pushed ${successCount}/${sessions.length} sessions to GitHub${
        lastError ? `. Last error: ${lastError}` : ''
      }.${readmeWarning}`,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      message: `Bulk push failed: ${errorMessage}`,
    };
  }
}

/**
 * Validate GitHub credentials by testing the API
 */
export async function validateGitHubCredentials(
  config: GitHubConfig
): Promise<GitHubSyncResult> {
  try {
    await githubApiRequest('GET', `/repos/${config.owner}/${config.repo}`);
    const branch = await resolveBranch(config);

    if (config.branch?.trim()) {
      await githubApiRequest(
        'GET',
        `/repos/${config.owner}/${config.repo}/branches/${encodeURIComponent(branch)}`
      );
    }

    return {
      success: true,
      message: `Successfully connected to ${config.owner}/${config.repo} on branch ${branch}`,
      branch,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      message: `Connection failed (owner=${config.owner}, repo=${config.repo}, branch=${config.branch || 'default'}): ${errorMessage}`,
    };
  }
}
