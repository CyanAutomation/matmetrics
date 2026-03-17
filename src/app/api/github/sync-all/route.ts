import { NextRequest, NextResponse } from 'next/server';
import { listSessions } from '@/lib/file-storage';
import { bulkPushSessions, validateGitHubCredentials, isGitHubConfigured } from '@/lib/github-storage';
import { GitHubConfig } from '@/lib/types';

/**
 * POST /api/github/sync-all
 * Bulk push all existing sessions to GitHub
 */
export async function POST(request: NextRequest) {
  try {
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

    const validation = await validateGitHubCredentials(config);
    if (!validation.success) {
      return NextResponse.json(validation, { status: 401 });
    }

    // Get all sessions from local markdown storage
    const sessions = await listSessions();

    // Push to GitHub
    const result = await bulkPushSessions(sessions, config);

    return NextResponse.json(result, { status: result.success ? 200 : 500 });
  } catch (error) {
    console.error('Error in bulk sync', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, message: `Bulk sync failed: ${message}` },
      { status: 500 }
    );
  }
}
