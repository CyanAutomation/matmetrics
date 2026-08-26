import { NextRequest, NextResponse } from 'next/server';
import { isGitHubConfigured } from '@/lib/github-storage';
import { GitHubConfig } from '@/lib/types';
import { requireAuthenticatedUser } from '@/lib/server-auth';
import { parseJsonObjectBody } from '@/lib/request-body';

/**
 * Shared authentication and validation logic for GitHub API routes.
 * Handles:
 * - User authentication check
 * - GitHub token configuration check
 * - Request body parsing and validation
 * - GitHubConfig construction and validation
 *
 * @param request - NextRequest object
 * @param options.parseMode - 'strict' uses parseJsonObjectBody, 'loose' uses request.json()
 * @returns Result object with either { ok: true, config, request } or { ok: false, response }
 */
export async function validateGitHubRoute(
  request: NextRequest,
  options: { parseMode?: 'strict' | 'loose' } = {}
): Promise<
  | { ok: true; config: GitHubConfig; request: NextRequest }
  | { ok: false; response: NextResponse }
> {
  const { parseMode = 'strict' } = options;

  // Step 1: Verify user is authenticated
  const authResult = await requireAuthenticatedUser(request);
  if (authResult instanceof NextResponse) {
    return { ok: false, response: authResult };
  }

  // Step 2: Verify GitHub token is configured
  if (!isGitHubConfigured()) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          success: false,
          message: 'GITHUB_TOKEN environment variable not configured',
        },
        { status: 400 }
      ),
    };
  }

  // Step 3: Parse request body
  let body: unknown;
  if (parseMode === 'strict') {
    const parsedBody = await parseJsonObjectBody(request);
    if (!parsedBody.ok) {
      return {
        ok: false,
        response: NextResponse.json(
          { success: false, message: 'Invalid request body' },
          { status: 400 }
        ),
      };
    }
    body = parsedBody.value;
  } else {
    try {
      body = await request.json();
    } catch {
      return {
        ok: false,
        response: NextResponse.json(
          { success: false, message: 'Invalid JSON in request body' },
          { status: 400 }
        ),
      };
    }
  }

  // Step 4: Build and validate config
  const config: GitHubConfig = {
    owner: typeof body === 'object' && body && 'owner' in body && typeof body.owner === 'string'
      ? body.owner.trim()
      : '',
    repo: typeof body === 'object' && body && 'repo' in body && typeof body.repo === 'string'
      ? body.repo.trim()
      : '',
    branch:
      typeof body === 'object' && body && 'branch' in body && typeof body.branch === 'string'
        ? body.branch.trim()
        : undefined,
  };

  if (!config.owner || !config.repo) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, message: 'Missing owner or repo' },
        { status: 400 }
      ),
    };
  }

  if (body && typeof body === 'object' && 'branch' in body && body.branch !== undefined && !config.branch) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, message: 'Branch cannot be empty when provided' },
        { status: 400 }
      ),
    };
  }

  return { ok: true, config, request };
}
