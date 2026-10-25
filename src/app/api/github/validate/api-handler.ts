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
 * POST /api/github/validate
 * Test GitHub credentials
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(request);
    if (user instanceof NextResponse) return user;
    if (isKeikoCutoverUser(user.appUserId)) {
      const validation = await validateKeikoGitHubRoute(request, ['owner', 'repo', 'branch']);
      if (!validation.ok) return validation.response;
      return forwardSessionRequestToKeiko(request, validation.user, {
        path: '/v1/github/health',
        method: 'POST',
        scope: 'github:read',
        body: validation.branch ? { branch: validation.branch } : {},
      });
    }
    const validation = await validateGitHubRoute(request, {
      parseMode: 'loose',
    });
    if (!validation.ok) {
      return validation.response;
    }

    return proxyGoFunction(request, {
      path: '/api/go/github/validate',
      method: 'POST',
      body: validation.config,
    });
  } catch (error) {
    console.error('Error validating GitHub credentials', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, message: `Validation failed: ${message}` },
      { status: 500 }
    );
  }
}
