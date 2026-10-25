// Internal handler dispatched by app/api/[...path]/route.ts.
import { NextRequest, NextResponse } from 'next/server';
import { proxyGoFunction } from '@/lib/go-function-proxy';
import { validateGitHubRoute } from '@/lib/github-route-helpers';
import {
  forwardSessionRequestToKeiko,
  isKeikoCutoverUser,
} from '@/lib/keiko-session-gateway.server';
import { validateKeikoGitHubRoute } from '@/lib/github-keiko-route.server';
import { requireAuthenticatedUser } from '@/lib/server-auth';

/**
 * POST /api/github/sync-all
 * Bulk push all existing sessions to GitHub
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(request);
    if (user instanceof NextResponse) return user;
    if (isKeikoCutoverUser(user.appUserId)) {
      const validation = await validateKeikoGitHubRoute(request, ['owner', 'repo', 'branch']);
      if (!validation.ok) return validation.response;
      return forwardSessionRequestToKeiko(request, validation.user, {
        path: '/v1/github/sync-all',
        method: 'POST',
        scope: 'github:write',
        body: {},
      });
    }
    const validation = await validateGitHubRoute(request, {
      parseMode: 'strict',
    });
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
