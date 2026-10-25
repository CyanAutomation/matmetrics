// Internal handler dispatched by app/api/[...path]/route.ts.
import { NextRequest, NextResponse } from 'next/server';

import { getBackgroundJob } from '@/lib/background-job-store.server';
import { DataWorkerError } from '@/lib/data-worker-client.server';
import { requireAuthenticatedUser } from '@/lib/server-auth';
import {
  forwardSessionRequestToKeiko,
  isKeikoCutoverUser,
} from '@/lib/keiko-session-gateway.server';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await requireAuthenticatedUser(request);
  if (user instanceof NextResponse) return user;
  const { id } = await context.params;
  if (isKeikoCutoverUser(user.appUserId)) {
    return forwardSessionRequestToKeiko(request, user, {
      path: `/v1/github/jobs/${encodeURIComponent(id)}`,
      method: 'GET',
      scope: 'github:read',
    });
  }
  try {
    return NextResponse.json(await getBackgroundJob(user.appUserId, id), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    if (error instanceof DataWorkerError && error.status === 404) {
      return NextResponse.json(
        { error: 'Background job not found' },
        { status: 404 }
      );
    }
    if (error instanceof DataWorkerError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error('Failed to load background job', error);
    return NextResponse.json(
      { error: 'Failed to load background job' },
      { status: 500 }
    );
  }
}
