// Internal handler dispatched by app/api/[...path]/route.ts.
import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/server-auth';
import { isKeikoCutoverUser } from '@/lib/keiko-session-gateway.server';
import {
  getSessionCreateMode,
  SESSION_CREATE_MODE_HEADER,
} from '@/lib/session-create-mode';

/** Authenticated, server-derived storage routing capability for session creates. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await requireAuthenticatedUser(request);
  if (user instanceof NextResponse) return user;

  const mode = getSessionCreateMode(
    isKeikoCutoverUser(user.appUserId),
    process.env.KEIKO_IDEMPOTENT_CREATE_ENABLED
  );
  return NextResponse.json(
    { mode },
    {
      headers: {
        [SESSION_CREATE_MODE_HEADER]: mode,
        'Cache-Control': 'private, no-store',
        Vary: 'Authorization',
      },
    }
  );
}
