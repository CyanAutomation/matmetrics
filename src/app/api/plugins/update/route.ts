import { NextRequest, NextResponse } from 'next/server';

import { createContractPayload } from '@/lib/plugins/api-contract';
import { requireAuthenticatedUser } from '@/lib/server-auth';

const DEPRECATION_MESSAGE =
  'Plugin updates via /api/plugins/update have been deprecated for standard UI clients.';

export async function POST(request: NextRequest) {
  const authResult = await requireAuthenticatedUser(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  return NextResponse.json(
    {
      error: DEPRECATION_MESSAGE,
      code: 'PLUGIN_ROUTE_DISABLED',
      ...createContractPayload({
        assumptions: [
          'This route is intentionally disabled for end-user and standard UI workflows.',
        ],
      }),
    },
    { status: 403 }
  );
}
