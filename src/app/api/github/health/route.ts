import { NextRequest, NextResponse } from 'next/server';

import { enqueueBackgroundJob } from '@/lib/background-job-store.server';
import { DataWorkerError, isDataWorkerConfigured } from '@/lib/data-worker-client.server';
import { validateGitHubRoute } from '@/lib/github-route-helpers';

export async function POST(request: NextRequest) {
  const validation = await validateGitHubRoute(request);
  if (!validation.ok) return validation.response;
  if (!isDataWorkerConfigured()) {
    return NextResponse.json({ error: 'Background jobs are not configured' }, { status: 503 });
  }
  try {
    const job = await enqueueBackgroundJob(validation.userId, {
      type: 'github-health',
      config: validation.config,
    });
    return NextResponse.json(job, { status: 202 });
  } catch (error) {
    if (error instanceof DataWorkerError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Failed to queue GitHub health check', error);
    return NextResponse.json({ error: 'Failed to queue GitHub health check' }, { status: 500 });
  }
}
