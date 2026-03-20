import { promises as fs } from 'fs';
import {
  createSession as createLocalSession,
  deleteSession as deleteLocalSession,
  findSessionFileById as findLocalSessionFileById,
  listSessions as listLocalSessions,
  updateSession as updateLocalSession,
} from './file-storage';
import {
  createSessionOnGitHub,
  deleteSessionOnGitHubById,
  findSessionPathOnGitHubById,
  GitHubSyncResult,
  isGitHubConfigured,
  updateSessionOnGitHub,
} from './github-storage';
import { markdownToSession } from './markdown-serializer';
import type { GitHubConfig, JudoSession } from './types';
import { compareDateOnlyDesc } from './utils';

const GITHUB_SESSION_ROOT = 'data';
const GITHUB_SESSION_PATH_REGEX = new RegExp(
  `^${GITHUB_SESSION_ROOT}/(\\d{4})/(\\d{2})/\\1\\2\\d{2}-matmetrics-[^/]+\\.md$`
);

/**
 * Very conservative validation for GitHub owner/repo names.
 * GitHub allows letters, digits, '.', '-', and '_' with length limits.
 */
function isValidGitHubOwnerOrRepo(name: string): boolean {
  if (!name) {
    return false;
  }
  // 1–39 characters, start with alphanumeric, then alphanumeric, '.', '-', or '_'
  const pattern = /^[A-Za-z0-9](?:[A-Za-z0-9_.-]{0,38})$/;
  return pattern.test(name);
}

function sanitizeGitHubOwnerOrRepo(raw: unknown): string {
  if (typeof raw !== 'string') {
    return '';
  }
  const trimmed = raw.trim();
  if (!isValidGitHubOwnerOrRepo(trimmed)) {
    return '';
  }
  return trimmed;
}

function normalizeBranch(branch: string | undefined): string | undefined {
  const trimmed = branch?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Sanitize a GitHub branch name for safe use in a query parameter.
 * Rejects control characters, whitespace, and obvious path traversal.
 */
function sanitizeGitHubBranch(raw: unknown): string | undefined {
  if (typeof raw !== 'string') {
    return undefined;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }
  // Disallow whitespace and control characters
  if (/[\x00-\x1F\x7F\s]/.test(trimmed)) {
    return undefined;
  }
  // Disallow simple path traversal sequences
  if (trimmed.includes('..')) {
    return undefined;
  }
  return trimmed;
}

export function normalizeGitHubConfig(
  config: Partial<GitHubConfig> | null | undefined
): GitHubConfig | null {
  if (!config) {
    return null;
  }

  const owner = sanitizeGitHubOwnerOrRepo(config.owner);
  const repo = sanitizeGitHubOwnerOrRepo(config.repo);
  const branch = sanitizeGitHubBranch(config.branch);

  if (!owner || !repo) {
    return null;
  }

  return { owner, repo, ...(branch ? { branch } : {}) };
}

export function shouldUseGitHubStorage(
  config: GitHubConfig | null | undefined
): config is GitHubConfig {
  return !!config && isGitHubConfigured();
}

async function readGitHubFileContent(
  config: GitHubConfig,
  filePath: string
): Promise<string> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('GITHUB_TOKEN environment variable not set');
  }

  const branch = normalizeBranch(config.branch);
  const query = branch ? `?ref=${encodeURIComponent(branch)}` : '';
  const response = await fetch(
    `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${filePath}${query}`,
    {
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'matmetrics',
      },
    }
  );

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`GitHub session not found at ${filePath}`);
    }

    const payload = await response.json().catch(() => null);
    const message =
      payload && typeof payload.message === 'string'
        ? payload.message
        : response.statusText;
    throw new Error(`GitHub API error ${response.status}: ${message}`);
  }

  const payload = await response.json();
  if (typeof payload?.content !== 'string') {
    throw new Error(
      `GitHub contents response for ${filePath} did not include file content`
    );
  }

  const content = payload.content.replace(/\n/g, '');
  return Buffer.from(content, 'base64').toString('utf8');
}

type GitHubContentsEntry = {
  path: string;
  type: 'file' | 'dir';
};

async function listGitHubSessionPaths(config: GitHubConfig): Promise<string[]> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('GITHUB_TOKEN environment variable not set');
  }

  const branch = normalizeBranch(config.branch);
  const paths: string[] = [];
  const queue: string[] = [GITHUB_SESSION_ROOT];

  while (queue.length > 0) {
    const currentPath = queue.shift();
    if (!currentPath) {
      continue;
    }

    const query = branch ? `?ref=${encodeURIComponent(branch)}` : '';
    const response = await fetch(
      `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${currentPath}${query}`,
      {
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'matmetrics',
        },
      }
    );

    if (response.status === 404 && currentPath === GITHUB_SESSION_ROOT) {
      break;
    }

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const message =
        payload && typeof payload.message === 'string'
          ? payload.message
          : response.statusText;
      throw new Error(`GitHub API error ${response.status}: ${message}`);
    }

    const payload = await response.json();
    const entries = Array.isArray(payload)
      ? (payload as GitHubContentsEntry[])
      : [];

    for (const entry of entries) {
      if (entry.type === 'dir') {
        queue.push(entry.path);
        continue;
      }

      if (
        entry.type === 'file' &&
        GITHUB_SESSION_PATH_REGEX.test(entry.path)
      ) {
        paths.push(entry.path);
      }
    }
  }

  return paths;
}

export async function listSessionsFromGitHub(
  config: GitHubConfig
): Promise<JudoSession[]> {
  const markdownPaths = await listGitHubSessionPaths(config);
  const sessionResults = await Promise.all(
    markdownPaths.map(async (filePath) => {
      try {
        const markdown = await readGitHubFileContent(config, filePath);
        return markdownToSession(markdown);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(
          `Skipping GitHub session file at ${filePath}: ${message}`
        );
        return null;
      }
    })
  );

  const sessions = sessionResults.filter(
    (session): session is JudoSession => session !== null
  );

  sessions.sort((a, b) => compareDateOnlyDesc(a.date, b.date));
  return sessions;
}

export async function readSessionByIdFromGitHub(
  id: string,
  config: GitHubConfig
): Promise<JudoSession | null> {
  const filePath = await findSessionPathOnGitHubById(id, config);
  if (!filePath) {
    return null;
  }

  return markdownToSession(await readGitHubFileContent(config, filePath));
}

export async function listSessionsForConfig(
  config: GitHubConfig | null
): Promise<JudoSession[]> {
  if (shouldUseGitHubStorage(config)) {
    return listSessionsFromGitHub(config);
  }

  return listLocalSessions();
}

export async function readSessionByIdForConfig(
  id: string,
  config: GitHubConfig | null
): Promise<JudoSession | null> {
  if (shouldUseGitHubStorage(config)) {
    return readSessionByIdFromGitHub(id, config);
  }

  const filePath = await findLocalSessionFileById(id);
  if (!filePath) {
    return null;
  }

  return markdownToSession(await fs.readFile(filePath, 'utf8'));
}

export async function createSessionForConfig(
  session: JudoSession,
  config: GitHubConfig | null
): Promise<GitHubSyncResult | null> {
  if (shouldUseGitHubStorage(config)) {
    const result = await createSessionOnGitHub(session, config);
    if (!result.success) {
      throw new Error(result.message);
    }
    return result;
  }

  await createLocalSession(session);
  return null;
}

export async function updateSessionForConfig(
  session: JudoSession,
  config: GitHubConfig | null
): Promise<GitHubSyncResult | null> {
  if (shouldUseGitHubStorage(config)) {
    const result = await updateSessionOnGitHub(session, config);
    if (!result.success) {
      throw new Error(result.message);
    }
    return result;
  }

  await updateLocalSession(session);
  return null;
}

export async function deleteSessionForConfig(
  id: string,
  config: GitHubConfig | null
): Promise<GitHubSyncResult | null> {
  if (shouldUseGitHubStorage(config)) {
    const result = await deleteSessionOnGitHubById(id, config);
    if (!result.success) {
      throw new Error(result.message);
    }
    return result;
  }

  await deleteLocalSession(id);
  return null;
}
