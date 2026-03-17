import { NextRequest, NextResponse } from 'next/server';
import { listSessionsForConfig, normalizeGitHubConfig } from '@/lib/session-storage';

/**
 * GET /api/sessions/list
 * Returns all sessions from the markdown files, sorted by date (newest first)
 */
export async function GET(request: NextRequest) {
  try {
    const gitHubConfig = normalizeGitHubConfig({
      owner: request.nextUrl.searchParams.get('owner') ?? undefined,
      repo: request.nextUrl.searchParams.get('repo') ?? undefined,
      branch: request.nextUrl.searchParams.get('branch') ?? undefined,
    });
    const sessions = await listSessionsForConfig(gitHubConfig);
    return NextResponse.json(sessions, { status: 200 });
  } catch (error) {
    console.error('Error listing sessions', error);
    return NextResponse.json(
      { error: 'Failed to list sessions' },
      { status: 500 }
    );
  }
}
