import { NextResponse } from 'next/server';

import { discoverEnabledDashboardTabExtensions } from '@/lib/plugins/discovery.server';

export async function GET() {
  try {
    const extensions = await discoverEnabledDashboardTabExtensions();
    return NextResponse.json({ extensions }, { status: 200 });
  } catch (error) {
    console.error('Error discovering plugin dashboard tabs', error);
    return NextResponse.json(
      { error: 'Failed to discover plugin dashboard tabs' },
      { status: 500 }
    );
  }
}
