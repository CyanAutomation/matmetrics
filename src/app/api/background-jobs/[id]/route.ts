import { NextRequest, NextResponse } from 'next/server';

import { getBackgroundJob } from '@/lib/background-job-store.server';
import { DataWorkerError } from '@/lib/data-worker-client.server';
import { requireAuthenticatedUser } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await requireAuthenticatedUser(request);
  if (user instanceof NextResponse) return user;
  const { id } = await context.params;
  try {
    return NextResponse.json(await getBackgroundJob(user.uid, id), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    if (error instanceof DataWorkerError && error.status === 404) {
      return NextResponse.json({ error: 'Background job not found' }, { status: 404 });
    }
    console.error('Failed to load background job', error);
    return NextResponse.json({ error: 'Failed to load background job' }, { status: 500 });
  }
}
