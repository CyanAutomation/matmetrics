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

function normalizeBranch(branch: string | undefined): string | undefined {
  const trimmed = branch?.trim();
  return trimmed ? trimmed : undefined;
}

export function normalizeGitHubConfig(config: Partial<GitHubConfig> | null | undefined): GitHubConfig | null {
  if (!config) {
    return null;
  }

  const owner = typeof config.owner === 'string' ? config.owner.trim() : '';
  const repo = typeof config.repo === 'string' ? config.repo.trim() : '';
  const branch = normalizeBranch(config.branch);

  if (!owner || !repo) {
    return null;
  }

  return { owner, repo, ...(branch ? { branch } : {}) };
}

export function shouldUseGitHubStorage(config: GitHubConfig | null | undefined): config is GitHubConfig {
  return !!config && isGitHubConfigured();
}

async function readGitHubFileContent(config: GitHubConfig, filePath: string): Promise<string> {
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
      payload && typeof payload.message === 'string' ? payload.message : response.statusText;
    throw new Error(`GitHub API error ${response.status}: ${message}`);
  }

  const payload = await response.json();
  if (typeof payload?.content !== 'string') {
    throw new Error(`GitHub contents response for ${filePath} did not include file content`);
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
  const queue = ['sessions'];
  const paths: string[] = [];

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

    if (response.status === 404 && currentPath === 'sessions') {
      return [];
    }

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const message =
        payload && typeof payload.message === 'string' ? payload.message : response.statusText;
      throw new Error(`GitHub API error ${response.status}: ${message}`);
    }

    const payload = await response.json();
    const entries = Array.isArray(payload) ? (payload as GitHubContentsEntry[]) : [];

    for (const entry of entries) {
      if (entry.type === 'dir') {
        queue.push(entry.path);
        continue;
      }

      if (entry.type === 'file' && /^sessions\/\d{4}\/\d{2}\/.+\.md$/.test(entry.path)) {
        paths.push(entry.path);
      }
    }
  }

  return paths;
}

export async function listSessionsFromGitHub(config: GitHubConfig): Promise<JudoSession[]> {
  const markdownPaths = await listGitHubSessionPaths(config);
  const sessions = await Promise.all(
    markdownPaths.map(async (filePath) => markdownToSession(await readGitHubFileContent(config, filePath)))
  );

  sessions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return sessions;
}

export async function readSessionByIdFromGitHub(id: string, config: GitHubConfig): Promise<JudoSession | null> {
  const filePath = await findSessionPathOnGitHubById(id, config);
  if (!filePath) {
    return null;
  }

  return markdownToSession(await readGitHubFileContent(config, filePath));
}

export async function listSessionsForConfig(config: GitHubConfig | null): Promise<JudoSession[]> {
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
