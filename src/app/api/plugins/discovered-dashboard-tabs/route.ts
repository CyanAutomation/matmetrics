import { NextResponse } from 'next/server';

import { discoverEnabledDashboardTabExtensions } from '@/lib/plugins/discovery.server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const extensions = await discoverEnabledDashboardTabExtensions();
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
