/**
 * Test mock builders for GitHub API responses
 */

import type { JudoSession } from '../types';
import { sessionToMarkdown } from '../markdown-serializer';

/**
 * Creates a minimal test session fixture
 */
// fallow-ignore-next-line unused-export
export function makeTestSession(
  id: string,
  overrides: Partial<JudoSession> = {}
): JudoSession {
  return {
    id,
    date: '2025-03-14',
    duration: 60,
    effort: 3,
    category: 'Technical',
    notes: 'test',
    techniques: [],
    ...overrides,
  };
}

/**
 * GitHub tree entry for a session file (internal to this module)
 */
interface GitHubTreeEntry {
  path: string;
  type: 'blob' | 'tree' | 'commit';
  sha?: string;
  size?: number;
}

/**
 * GitHub directory listing entry (from /contents API, internal to this module)
 */
interface GitHubContentsEntry {
  name: string;
  path: string;
  type: 'file' | 'dir';
  sha?: string;
}

/**
 * Builder for composable GitHub API mocks
 */
// fallow-ignore-next-line unused-export
export class GitHubMockBuilder {
  private branches = new Map<string, { commitSha: string; treeSha: string }>();
  private trees = new Map<string, { truncated: boolean; entries: GitHubTreeEntry[] }>();
  private contents = new Map<string, GitHubContentsEntry[]>();
  private files = new Map<string, { sha: string; content: string }>();
  private defaultBranch = 'main';

  /**
   * Configure the default branch for the repo
   */
  setDefaultBranch(branch: string): this {
    this.defaultBranch = branch;
    return this;
  }

  /**
   * Add a branch with a commit and tree SHA
   */
  addBranch(branch: string, commitSha: string, treeSha: string): this {
    this.branches.set(branch, { commitSha, treeSha });
    return this;
  }

  /**
   * Add a tree with entries (optionally truncated)
   */
  addTree(
    treeSha: string,
    entries: GitHubTreeEntry[],
    truncated = false
  ): this {
    this.trees.set(treeSha, { truncated, entries });
    return this;
  }

  /**
   * Add a directory listing for the /contents API
   */
  addContentsListing(path: string, entries: GitHubContentsEntry[]): this {
    this.contents.set(path, entries);
    return this;
  }

  /**
   * Add a file with content (for GET /contents/:path)
   */
  addFile(path: string, content: string, sha = 'file-sha'): this {
    this.files.set(path, { sha, content });
    return this;
  }

  /**
   * Add a session file at the appropriate path
   */
  addSession(session: JudoSession, sha = 'session-sha'): this {
    const date = new Date(session.date);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const datePrefix = session.date.replace(/-/g, '');
    const encodedId = encodeURIComponent(session.id);
    const path = `data/${year}/${month}/${datePrefix}-matmetrics-${encodedId}.md`;
    
    const content = sessionToMarkdown(session);
    return this.addFile(path, content, sha);
  }

  /**
   * Build the mock fetch handler
   */
  build(owner = 'o', repo = 'r'): typeof fetch {
    const branches = this.branches;
    const trees = this.trees;
    const contents = this.contents;
    const files = this.files;
    const defaultBranch = this.defaultBranch;

    return (async (url: string | URL | Request, init?: RequestInit) => {
      const parsed = new URL(String(url));
      const path = parsed.pathname;
      const method = init?.method ?? 'GET';

      // GET /repos/:owner/:repo - get repository metadata
      if (path === `/repos/${owner}/${repo}` && method === 'GET') {
        return new Response(
          JSON.stringify({ default_branch: defaultBranch }),
          { status: 200 }
        );
      }

      // GET /repos/:owner/:repo/git/ref/heads/:branch - get branch ref
      const refMatch = path.match(/\/repos\/[^/]+\/[^/]+\/git\/ref\/heads\/(.+)$/);
      if (refMatch && method === 'GET') {
        const branch = refMatch[1];
        const branchData = branches.get(branch);
        if (!branchData) {
          return new Response(JSON.stringify({ message: 'Not Found' }), {
            status: 404,
          });
        }
        return new Response(
          JSON.stringify({
            object: { sha: branchData.commitSha, type: 'commit' },
          }),
          { status: 200 }
        );
      }

      // GET /repos/:owner/:repo/git/commits/:sha - get commit
      const commitMatch = path.match(/\/repos\/[^/]+\/[^/]+\/git\/commits\/(.+)$/);
      if (commitMatch && method === 'GET') {
        const commitSha = commitMatch[1];
        // Find the branch with this commit SHA
        for (const [, branchData] of branches) {
          if (branchData.commitSha === commitSha) {
            return new Response(
              JSON.stringify({ tree: { sha: branchData.treeSha } }),
              { status: 200 }
            );
          }
        }
        return new Response(JSON.stringify({ message: 'Not Found' }), {
          status: 404,
        });
      }

      // GET /repos/:owner/:repo/git/trees/:sha - get tree
      const treeMatch = path.match(/\/repos\/[^/]+\/[^/]+\/git\/trees\/(.+)$/);
      if (treeMatch && method === 'GET') {
        const treeSha = treeMatch[1];
        const tree = trees.get(treeSha);
        if (!tree) {
          return new Response(JSON.stringify({ message: 'Not Found' }), {
            status: 404,
          });
        }
        return new Response(
          JSON.stringify({
            truncated: tree.truncated,
            tree: tree.entries,
          }),
          { status: 200 }
        );
      }

      // GET /repos/:owner/:repo/contents/:path - get file or directory
      const contentsMatch = path.match(/\/repos\/[^/]+\/[^/]+\/contents\/(.+)$/);
      if (contentsMatch && method === 'GET') {
        const contentPath = decodeURIComponent(contentsMatch[1]);
        
        // Check if it's a directory listing
        const dirListing = contents.get(contentPath);
        if (dirListing) {
          return new Response(JSON.stringify(dirListing), { status: 200 });
        }

        // Check if it's a file
        const file = files.get(contentPath);
        if (file) {
          return new Response(
            JSON.stringify({
              sha: file.sha,
              content: Buffer.from(file.content).toString('base64'),
            }),
            { status: 200 }
          );
        }

        return new Response(JSON.stringify({ message: 'Not Found' }), {
          status: 404,
        });
      }

      // PUT /repos/:owner/:repo/contents/:path - update file
      if (contentsMatch && method === 'PUT') {
        const contentPath = decodeURIComponent(contentsMatch[1]);
        const body = JSON.parse(String(init?.body));
        const file = files.get(contentPath);

        // Check SHA match for updates
        if (file && body.sha !== file.sha) {
          return new Response(JSON.stringify({ message: 'sha does not match' }), {
            status: 409,
          });
        }

        // Update file
        const newSha = `updated-${Date.now()}`;
        const newContent = Buffer.from(body.content, 'base64').toString('utf8');
        files.set(contentPath, { sha: newSha, content: newContent });

        return new Response(
          JSON.stringify({ content: { sha: newSha } }),
          { status: 200 }
        );
      }

      // Default: not found
      return new Response(
        JSON.stringify({ message: `Unexpected path: ${method} ${path}` }),
        { status: 404 }
      );
    }) as typeof fetch;
  }
}

/**
 * Helper to mock GitHub API with the given handler
 */
// fallow-ignore-next-line unused-export
export async function withMockedGitHub(
  handler: typeof fetch,
  run: () => Promise<void>
) {
  const originalFetch = global.fetch;
  const originalToken = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = 'test-token';
  global.fetch = handler;

  try {
    await run();
  } finally {
    global.fetch = originalFetch;
    if (originalToken === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = originalToken;
    }
  }
}
