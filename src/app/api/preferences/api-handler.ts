// Internal handler dispatched by app/api/[...path]/route.ts.
import { NextRequest, NextResponse } from 'next/server';

import { DataWorkerError } from '@/lib/data-worker-client.server';
import {
  loadStoredPreferences,
  PreferencesStoreConfigurationError,
  saveStoredPreferences,
} from '@/lib/preferences-store.server';
import { PREFERENCE_API_ERROR_CODES } from '@/lib/preference-api-errors';
import { parseJsonObjectBody } from '@/lib/request-body';
import { requireAuthenticatedUser } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

function preferencesFailure(error: unknown): NextResponse {
  if (
    error instanceof PreferencesStoreConfigurationError ||
    (error instanceof DataWorkerError && error.category === 'configuration')
  ) {
    return NextResponse.json(
      {
        error:
          'Saved preferences are not configured. Contact the site administrator.',
        code: PREFERENCE_API_ERROR_CODES.storeConfiguration,
      },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  if (error instanceof DataWorkerError && error.status === 409) {
    return NextResponse.json(
      {
        error: 'Preferences changed elsewhere. Reload and try again.',
        code: PREFERENCE_API_ERROR_CODES.conflict,
      },
      { status: 409, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  if (
    error instanceof DataWorkerError &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 429
  ) {
    return NextResponse.json(
      {
        error: 'The preferences request could not be completed.',
        code: PREFERENCE_API_ERROR_CODES.requestFailed,
      },
      { status: error.status, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  return NextResponse.json(
    {
      error: 'Saved preferences are temporarily unavailable. Please try again.',
      code: PREFERENCE_API_ERROR_CODES.unavailable,
    },
    {
      status: error instanceof DataWorkerError ? error.status : 503,
      headers: { 'Cache-Control': 'no-store' },
    }
  );
}

export async function GET(request: NextRequest) {
  const user = await requireAuthenticatedUser(request, { includeErrorCode: true });
  if (user instanceof NextResponse) return user;
  try {
    return NextResponse.json(await loadStoredPreferences(user.appUserId), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('Failed to load user preferences', error);
    return preferencesFailure(error);
  }
}

export async function PUT(request: NextRequest) {
  const user = await requireAuthenticatedUser(request, { includeErrorCode: true });
  if (user instanceof NextResponse) return user;
  const body = await parseJsonObjectBody(request);
  if (
    !body.ok ||
    !body.value.preferences ||
    typeof body.value.preferences !== 'object' ||
    Array.isArray(body.value.preferences) ||
    !Number.isInteger(body.value.revision) ||
    (body.value.revision as number) < 0
  ) {
    return NextResponse.json(
      {
        error: 'Invalid preference payload',
        code: PREFERENCE_API_ERROR_CODES.invalidPayload,
      },
      { status: 400 }
    );
  }
  try {
    return NextResponse.json(
      await saveStoredPreferences(
        user.appUserId,
        body.value.preferences as Record<string, unknown>,
        body.value.revision as number
      ),
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('Failed to save user preferences', error);
    return preferencesFailure(error);
  }
}
