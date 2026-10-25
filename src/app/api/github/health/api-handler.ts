// Internal handler dispatched by app/api/[...path]/route.ts.
import { NextRequest, NextResponse } from 'next/server';

import { enqueueBackgroundJob } from '@/lib/background-job-store.server';
import {
  DataWorkerError,
  isDataWorkerConfigured,
} from '@/lib/data-worker-client.server';
import { validateGitHubRoute } from '@/lib/github-route-helpers';
import { requireAuthenticatedUser } from '@/lib/server-auth';
import {
  forwardSessionRequestToKeiko,
  isKeikoCutoverUser,
} from '@/lib/keiko-session-gateway.server';
import { validateKeikoGitHubRoute } from '@/lib/github-keiko-route.server';

export async function POST(request: NextRequest) {
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
  const validation = await validateGitHubRoute(request);
  if (!validation.ok) return validation.response;
  if (!isDataWorkerConfigured()) {
    return NextResponse.json(
      {
        error:
          'Background jobs are unavailable because the background data service is not configured.',
      },
      { status: 503 }
    );
  }
  try {
    const job = await enqueueBackgroundJob(validation.userId, {
      type: 'github-health',
      config: validation.config,
    });
    return NextResponse.json(job, { status: 202 });
  } catch (error) {
    if (error instanceof DataWorkerError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error('Failed to queue GitHub health check', error);
    return NextResponse.json(
      { error: 'Failed to queue GitHub health check' },
      { status: 500 }
    );
  }
}
