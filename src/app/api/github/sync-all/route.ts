import { NextRequest, NextResponse } from 'next/server';
import { listSessions } from '@/lib/vercel-blob-storage';
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
      owner: body.owner,
      repo: body.repo,
    };

    // Validate config
    if (!config.owner || !config.repo) {
      return NextResponse.json(
        { success: false, message: 'Missing owner or repo' },
        { status: 400 }
      );
    }

    // Get all sessions from Vercel Blob
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
