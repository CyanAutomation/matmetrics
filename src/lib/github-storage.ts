import { JudoSession } from './types';
import { sessionToMarkdown } from './markdown-serializer';

export interface GitHubConfig {
  owner: string;
  repo: string;
}

export interface GitHubSyncResult {
  success: boolean;
  message: string;
  filePath?: string;
  sha?: string;
}

interface GitHubContentItem {
  name: string;
  path: string;
  type: 'file' | 'dir' | 'symlink' | 'submodule';
}

/**
 * Get the file path for a session in GitHub
 * Format: sessions/YYYY/MM/YYYYMMDD-matmetrics-{id}.md
 */
export function getGitHubSessionPath(session: JudoSession): string {
  const [year, month, day] = session.date.split('-');
  const fileName = `${year}${month}${day}-matmetrics-${session.id}.md`;
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
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      `GitHub API error ${response.status}: ${errorData.message || response.statusText}`
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
  path: string
): Promise<string | null> {
  try {
    const data = await githubApiRequest(
      'GET',
      `/repos/${owner}/${repo}/contents/${path}`
    );
    return data.sha;
  } catch (error) {
    // File doesn't exist, return null
    return null;
  }
}

async function listDirectoryContents(
  owner: string,
  repo: string,
  path: string
): Promise<GitHubContentItem[]> {
  try {
    const data = await githubApiRequest(
      'GET',
      `/repos/${owner}/${repo}/contents/${path}`
    );

    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/**
 * Find a session file path in GitHub by session ID by scanning sessions/YYYY/MM folders.
 */
export async function findSessionPathOnGitHubById(
  sessionId: string,
  config: GitHubConfig
): Promise<string | null> {
  const fileSuffix = `-matmetrics-${sessionId}.md`;
  const years = await listDirectoryContents(config.owner, config.repo, 'sessions');

  for (const year of years) {
    if (year.type !== 'dir' || !/^\d{4}$/.test(year.name)) continue;

    const months = await listDirectoryContents(config.owner, config.repo, year.path);
    for (const month of months) {
      if (month.type !== 'dir' || !/^\d{2}$/.test(month.name)) continue;

      const files = await listDirectoryContents(config.owner, config.repo, month.path);
      const match = files.find(
        (file) => file.type === 'file' && file.name.endsWith(fileSuffix)
      );

      if (match) {
        return match.path;
      }
    }
  }

  return null;
}

/**
 * Create or update a file in GitHub
 */
async function putFile(
  owner: string,
  repo: string,
  path: string,
  content: string,
  message: string,
  sha?: string | null
): Promise<GitHubSyncResult> {
  try {
    const contentBase64 = Buffer.from(content).toString('base64');
    
    const body = {
      message,
      content: contentBase64,
      branch: 'main',
      ...(sha && { sha }),
    };

    const data = await githubApiRequest(
      'PUT',
      `/repos/${owner}/${repo}/contents/${path}`,
      body
    );

    return {
      success: true,
      message: sha ? 'Session updated on GitHub' : 'Session created on GitHub',
      filePath: path,
      sha: data.content?.sha || data.sha,
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

  return putFile(config.owner, config.repo, filePath, markdown, message);
}

/**
 * Update an existing session file in GitHub
 */
export async function updateSessionOnGitHub(
  session: JudoSession,
  config: GitHubConfig
): Promise<GitHubSyncResult> {
  const filePath = getGitHubSessionPath(session);
  const markdown = sessionToMarkdown(session);
  const sha = await getFileSha(config.owner, config.repo, filePath);

  if (!sha) {
    // File doesn't exist, create it
    return createSessionOnGitHub(session, config);
  }

  const message = `Update session: ${session.date}`;
  return putFile(config.owner, config.repo, filePath, markdown, message, sha);
}

/**
 * Delete a session file from GitHub
 */
export async function deleteSessionOnGitHub(
  session: JudoSession,
  config: GitHubConfig
): Promise<GitHubSyncResult> {
  try {
    const expectedPath = getGitHubSessionPath(session);
    let filePath = expectedPath;
    let sha = await getFileSha(config.owner, config.repo, expectedPath);

    if (!sha) {
      const discoveredPath = await findSessionPathOnGitHubById(session.id, config);
      if (discoveredPath) {
        filePath = discoveredPath;
        sha = await getFileSha(config.owner, config.repo, discoveredPath);
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
        branch: 'main',
        sha,
      }
    );

    return {
      success: true,
      message: 'Session deleted from GitHub',
      filePath,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      message: `GitHub delete failed: ${errorMessage}`,
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
    const filePath = await findSessionPathOnGitHubById(sessionId, config);

    if (!filePath) {
      return {
        success: true,
        message: 'Session not found on GitHub (already deleted)',
      };
    }

    const sha = await getFileSha(config.owner, config.repo, filePath);
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
        branch: 'main',
        sha,
      }
    );

    return {
      success: true,
      message: 'Session deleted from GitHub',
      filePath,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      message: `GitHub delete failed: ${errorMessage}`,
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

    const sha = await getFileSha(config.owner, config.repo, 'README.md');
    return putFile(
      config.owner,
      config.repo,
      'README.md',
      readme,
      'Update README with session stats',
      sha
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      message: `Failed to create README: ${errorMessage}`,
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

    // Update README with stats
    const latestDate = sessions[0]?.date;
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
    return {
      success: true,
      message: `Successfully connected to ${config.owner}/${config.repo}`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      message: `Connection failed: ${errorMessage}`,
    };
  }
}
