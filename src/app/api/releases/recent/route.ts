import { NextResponse } from 'next/server';

import { APP_VERSION } from '@/lib/app-version';
import {
  assertReleaseVersionConsistency,
  getRecentReleases,
} from '@/lib/releases';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const jsonNoStore = (body: unknown, init?: ResponseInit) =>
  NextResponse.json(body, {
    ...init,
    headers: {
      'Cache-Control': 'no-store, no-cache, max-age=0, must-revalidate',
      ...(init?.headers ?? {}),
    },
  });

export async function GET() {
  try {
    const releases = await getRecentReleases(3);
    assertReleaseVersionConsistency(releases);

    return jsonNoStore({
      currentVersion: APP_VERSION,
      releases,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return jsonNoStore(
      {
        error: 'Failed to load recent releases',
        details: message,
      },
      { status: 500 }
    );
  }
}
