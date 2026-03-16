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

const defaultBranchCache = new Map<string, string>();

interface GitHubContentItem {
  name: string;
  path: string;
  type: 'file' | 'dir' | 'symlink' | 'submodule';
}

class GitHubApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'GitHubApiError';
  }
}

function isGitHubApiError(error: unknown): error is GitHubApiError {
  return error instanceof GitHubApiError;
}

function getActionableGitHubErrorMessage(action: string, error: unknown): string {
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

function sanitizeSessionId(sessionId: string): string {
  if (sessionId.length > 100) {
    throw new Error('Session ID exceeds maximum allowed length of 100 characters');
  }

  return sessionId.replace(/[^a-zA-Z0-9-_]/g, '-');
}

/**
 * Get the file path for a session in GitHub
 * Format: sessions/YYYY/MM/YYYYMMDD-matmetrics-{id}.md
 */
export function getGitHubSessionPath(session: JudoSession): string {
  const [year, month, day] = session.date.split('-');
  const fileName = `${year}${month}${day}-matmetrics-${sanitizeSessionId(session.id)}.md`;
  return `sessions/${year}/${month}/${fileName}`;
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
      'Accept': 'application/vnd.github.v3+json',
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

async function listDirectoryContents(
  owner: string,
  repo: string,
  path: string,
  branch: string
): Promise<GitHubContentItem[]> {
  try {
    const data = await githubApiRequest(
      'GET',
      `/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`
    );

    return Array.isArray(data) ? data : [];
  } catch (error) {
    if (error instanceof GitHubApiError && error.status !== 404) {
      throw error;
    }

    return [];
  }
}

async function resolveBranch(config: GitHubConfig): Promise<string> {
  if (config.branch?.trim()) {
    return config.branch.trim();
  }

  const cacheKey = `${config.owner}/${config.repo}`;
  const cachedBranch = defaultBranchCache.get(cacheKey);
  if (cachedBranch) {
    return cachedBranch;
  }

  try {
    const repoData = await githubApiRequest('GET', `/repos/${config.owner}/${config.repo}`);
    const defaultBranch = repoData?.default_branch;

    if (typeof defaultBranch !== 'string' || defaultBranch.trim() === '') {
      throw new Error('Repository default branch is unavailable');
    }

    defaultBranchCache.set(cacheKey, defaultBranch);
    return defaultBranch;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(
      `Unable to resolve repository branch for ${config.owner}/${config.repo}: ${errorMessage}`
    );
  }
}

/**
 * Find a session file path in GitHub by session ID by scanning sessions/YYYY/MM folders.
 */
export async function findSessionPathOnGitHubById(
  sessionId: string,
  config: GitHubConfig
): Promise<string | null> {
  const branch = await resolveBranch(config);
  const fileSuffix = `-matmetrics-${sanitizeSessionId(sessionId)}.md`;
  const years = await listDirectoryContents(config.owner, config.repo, 'sessions', branch);
  const yearPaths: string[] = [];

  for (const year of years) {
    if (year.type === 'dir' && /^\d{4}$/.test(year.name)) {
      yearPaths.push(year.path);
    }
  }

  const monthContents = await Promise.all(
    yearPaths.map((yearPath) =>
      listDirectoryContents(config.owner, config.repo, yearPath, branch)
    )
  );

  const monthPaths: string[] = [];

  for (const months of monthContents) {
    for (const month of months) {
      if (month.type === 'dir' && /^\d{2}$/.test(month.name)) {
        monthPaths.push(month.path);
      }
    }
  }

  const fileLists = await Promise.all(
    monthPaths.map((monthPath) =>
      listDirectoryContents(config.owner, config.repo, monthPath, branch)
    )
  );

  for (const files of fileLists) {
    const match = files.find(
      (file) => file.type === 'file' && file.name.endsWith(fileSuffix)
    );

    if (match) {
      return match.path;
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
    const branch = await resolveBranch(config);
    
    const body = {
      message,
      content: contentBase64,
      branch,
      ...(sha && { sha }),
    };

    const data = await githubApiRequest(
      'PUT',
      `/repos/${config.owner}/${config.repo}/contents/${path}`,
      body
    );

    return {
      success: true,
      message: sha ? 'Session updated on GitHub' : 'Session created on GitHub',
      filePath: path,
      sha: data.content?.sha || data.sha,
      branch,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
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
  const filePath = getGitHubSessionPath(session);
  const markdown = sessionToMarkdown(session);
  const message = `Add session: ${session.date}`;

  return putFile(config, filePath, markdown, message);
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
    const filePath = getGitHubSessionPath(session);
    const markdown = sessionToMarkdown(session);
    const sha = await getFileSha(config.owner, config.repo, filePath, branch);

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

    const message = `Update session: ${session.date}`;
    return putFile(config, filePath, markdown, message, sha);
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
      const discoveredPath = await findSessionPathOnGitHubById(session.id, config);
      if (discoveredPath) {
        filePath = discoveredPath;
        sha = await getFileSha(config.owner, config.repo, discoveredPath, branch);
      }
    }

    if (!sha) {
      return {
        success: true,
        message: 'Session not found on GitHub (already deleted)',
      };
    }

    await githubApiRequest(
      'DELETE',
      `/repos/${config.owner}/${config.repo}/contents/${filePath}`,
      {
        message: `Delete session: ${session.date}`,
        branch,
        sha,
      }
    );

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

    await githubApiRequest(
      'DELETE',
      `/repos/${config.owner}/${config.repo}/contents/${filePath}`,
      {
        message: `Delete session by id: ${sessionId}`,
        branch,
        sha,
      }
    );

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

Sessions are organized by date in \`sessions/YYYY/MM/\` directories as markdown files.

Each session includes:
- Date and session type (Technical, Randori, or Shiai)
- Effort level (1-5)
- Techniques practiced
- Notes and observations

---

*This repository is automatically synced with matmetrics.*
`;

    const branch = await resolveBranch(config);
    const sha = await getFileSha(config.owner, config.repo, 'README.md', branch);
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
        return Number.isNaN(timestamp) ? null : { date: session.date, timestamp };
      })
      .filter((session): session is { date: string; timestamp: number } => session !== null)
      .reduce<{ date: string; timestamp: number } | undefined>((max, session) => {
        if (!max || session.timestamp > max.timestamp) {
          return session;
        }

        return max;
      }, undefined)?.date;

    // Update README with stats
    await createGitHubReadme(config, sessions.length, latestDate);

    return {
      success: lastError === '',
      message: `Pushed ${successCount}/${sessions.length} sessions to GitHub${
        lastError ? `. Last error: ${lastError}` : ''
      }`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      message: `Connection failed (owner=${config.owner}, repo=${config.repo}, branch=${config.branch || 'default'}): ${errorMessage}`,
    };
  }
}
