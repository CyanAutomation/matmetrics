import { NextRequest, NextResponse } from 'next/server';

import { discoverEnabledDashboardTabExtensions } from '@/lib/plugins/discovery.server';
import { requireAuthenticatedUser } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(request);
    if (user instanceof NextResponse) return user;
    const extensions = await discoverEnabledDashboardTabExtensions({
      userId: user.uid,
    });
    return NextResponse.json(
      { extensions },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store, no-cache, max-age=0, must-revalidate',
        },
      }
    );
  } catch (error) {
    console.error('Error discovering plugin dashboard tabs', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to discover plugin dashboard tabs',
      },
      { status: 500 }
    );
  }
}
