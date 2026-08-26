import { NextRequest, NextResponse } from 'next/server';
import { proxyGoFunction } from '@/lib/go-function-proxy';
import { validateGitHubRoute } from '@/lib/github-route-helpers';

/**
 * POST /api/github/sync-all
 * Bulk push all existing sessions to GitHub
 */
export async function POST(request: NextRequest) {
  try {
    const validation = await validateGitHubRoute(request, { parseMode: 'strict' });
    if (!validation.ok) {
      return validation.response;
    }

    return proxyGoFunction(request, {
      path: '/api/go/github/sync-all',
      method: 'POST',
      body: validation.config,
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
