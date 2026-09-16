import { NextRequest, NextResponse } from 'next/server';
import { enqueueBackgroundJob } from '@/lib/background-job-store.server';
import {
  DataWorkerError,
  isDataWorkerConfigured,
} from '@/lib/data-worker-client.server';
import { validateGitHubRoute } from '@/lib/github-route-helpers';

/**
 * POST /api/github/log-doctor
 * Diagnose markdown logs in a GitHub repository
 */
export async function POST(request: NextRequest) {
  const validation = await validateGitHubRoute(request);
  if (!validation.ok) return validation.response;
  if (!isDataWorkerConfigured()) {
    return NextResponse.json(
      { success: false, message: 'Background jobs are not configured' },
      { status: 503 }
    );
  }
  try {
    const job = await enqueueBackgroundJob(validation.userId, {
      type: 'log-doctor-scan',
      config: validation.config,
    });
    return NextResponse.json(job, { status: 202 });
  } catch (error) {
    if (error instanceof DataWorkerError) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: error.status }
      );
    }
    console.error('Failed to queue log diagnosis', error);
    return NextResponse.json(
      { success: false, message: 'Failed to queue log diagnosis' },
      { status: 500 }
    );
  }
}
