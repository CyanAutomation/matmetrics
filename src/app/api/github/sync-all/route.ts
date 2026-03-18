import { NextRequest, NextResponse } from 'next/server';
import { isGitHubConfigured } from '@/lib/github-storage';
import { proxyGoFunction } from '@/lib/go-function-proxy';
import { GitHubConfig } from '@/lib/types';
import { requireAuthenticatedUser } from '@/lib/server-auth';

/**
 * POST /api/github/sync-all
 * Bulk push all existing sessions to GitHub
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuthenticatedUser(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    if (!isGitHubConfigured()) {
      return NextResponse.json(
        { success: false, message: 'GITHUB_TOKEN environment variable not configured' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const config: GitHubConfig = {
      owner: typeof body.owner === 'string' ? body.owner.trim() : '',
      repo: typeof body.repo === 'string' ? body.repo.trim() : '',
      branch: typeof body.branch === 'string' ? body.branch.trim() : undefined,
    };

    // Validate config
    if (!config.owner || !config.repo) {
      return NextResponse.json(
        { success: false, message: 'Missing owner or repo' },
        { status: 400 }
      );
    }

    if (body.branch !== undefined && !config.branch) {
      return NextResponse.json(
        { success: false, message: 'Branch cannot be empty when provided' },
        { status: 400 }
      );
    }

    return proxyGoFunction(request, {
      path: '/api/go/github/sync-all',
      method: 'POST',
      body: config,
    });
  } catch (error) {
    console.error('Error in bulk sync', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, message: `Bulk sync failed: ${message}` },
      { status: 500 }
    );
  }
}
