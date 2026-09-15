import { NextRequest, NextResponse } from 'next/server';

import { DataWorkerError } from '@/lib/data-worker-client.server';
import {
  loadStoredPreferences,
  saveStoredPreferences,
} from '@/lib/preferences-store.server';
import { parseJsonObjectBody } from '@/lib/request-body';
import { requireAuthenticatedUser } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await requireAuthenticatedUser(request);
  if (user instanceof NextResponse) return user;
  try {
    return NextResponse.json(await loadStoredPreferences(user.uid), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('Failed to load user preferences', error);
    return NextResponse.json({ error: 'Failed to load preferences' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const user = await requireAuthenticatedUser(request);
  if (user instanceof NextResponse) return user;
  const body = await parseJsonObjectBody(request);
  if (!body.ok || !body.value.preferences || typeof body.value.preferences !== 'object' || Array.isArray(body.value.preferences) || !Number.isInteger(body.value.revision) || (body.value.revision as number) < 0) {
    return NextResponse.json({ error: 'Invalid preference payload' }, { status: 400 });
  }
  try {
    return NextResponse.json(
      await saveStoredPreferences(
        user.uid,
        body.value.preferences as Record<string, unknown>,
        body.value.revision as number
      ),
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    if (error instanceof DataWorkerError && error.status === 409) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error('Failed to save user preferences', error);
    return NextResponse.json({ error: 'Failed to save preferences' }, { status: 500 });
  }
}
