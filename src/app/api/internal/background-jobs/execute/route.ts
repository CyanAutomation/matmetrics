import { timingSafeEqual } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import { backgroundJobRequestSchema } from '@/lib/background-jobs';
import { checkGitHubHealth } from '@/lib/github-health';
import { scanTrainingDataWithNext } from '@/lib/log-doctor-fallback';
import { parseJsonObjectBody } from '@/lib/request-body';

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.MATMETRICS_BACKGROUND_EXECUTOR_SECRET;
  const value = request.headers.get('authorization');
  if (!secret || !value?.startsWith('Bearer ')) return false;
  const candidate = value.substring(7);
  const left = Buffer.from(candidate);
  const right = Buffer.from(secret);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: NextRequest) {
  if (!process.env.MATMETRICS_BACKGROUND_EXECUTOR_SECRET) {
    return NextResponse.json(
      { error: 'Background executor is not configured' },
      { status: 500 }
    );
  }
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await parseJsonObjectBody(request, { maxBytes: 8 * 1024 });
  if (!body.ok)
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  const parsed = backgroundJobRequestSchema.safeParse(body.value);
  if (!parsed.success)
    return NextResponse.json(
      { error: 'Invalid background job' },
      { status: 400 }
    );

  try {
    if (parsed.data.type === 'log-doctor-scan') {
      return NextResponse.json(
        await scanTrainingDataWithNext(parsed.data.config)
      );
    }
    return NextResponse.json(await checkGitHubHealth(parsed.data.config));
  } catch (error) {
    console.error('Background job execution failed', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Background job failed',
      },
      { status: 503 }
    );
  }
}
