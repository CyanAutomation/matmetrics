// Internal handler dispatched by app/api/[...path]/route.ts.
import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

import { APP_VERSION } from '@/lib/app-version';
import {
  assertReleaseVersionConsistency,
  getRecentReleases,
} from '@/lib/releases';

const jsonNoStore = (body: unknown, init?: ResponseInit) =>
  NextResponse.json(body, {
    ...init,
    headers: {
      'Cache-Control': 'no-store, no-cache, max-age=0, must-revalidate',
      ...(init?.headers ?? {}),
    },
  });

const RELEASE_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=0, must-revalidate',
  'CDN-Cache-Control':
    'public, s-maxage=300, stale-while-revalidate=3600',
};

function jsonCachedReleaseResponse(
  request: NextRequest,
  body: unknown
): NextResponse {
  const etag = `"${createHash('sha256').update(JSON.stringify(body)).digest('hex')}"`;
  const headers = { ...RELEASE_CACHE_HEADERS, ETag: etag };
  if (request.headers.get('if-none-match') === etag) {
    return new NextResponse(null, { status: 304, headers });
  }
  return NextResponse.json(body, { headers });
}

export async function GET(request: NextRequest) {
  try {
    const releases = await getRecentReleases(3);
    assertReleaseVersionConsistency(releases);

    return jsonCachedReleaseResponse(request, {
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
