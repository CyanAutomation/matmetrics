import { NextResponse, type NextRequest } from 'next/server';
import { parseJsonObjectBody } from './request-body';
import { requireAuthenticatedUser } from './server-auth';
import type { AuthenticatedPrincipal } from './server-auth-types';

export async function validateKeikoGitHubRoute(
  request: NextRequest,
  allowedKeys: readonly string[]
): Promise<
  | { ok: true; user: AuthenticatedPrincipal; body: Record<string, unknown>; branch?: string }
  | { ok: false; response: NextResponse }
> {
  const user = await requireAuthenticatedUser(request);
  if (user instanceof NextResponse) return { ok: false, response: user };

  const parsed = await parseJsonObjectBody(request);
  if (!parsed.ok) {
    return { ok: false, response: NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) };
  }
  const body = parsed.value;
  if (Object.keys(body).some((key) => !allowedKeys.includes(key))) {
    return { ok: false, response: NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) };
  }
  let branch: string | undefined;
  if (Object.hasOwn(body, 'branch')) {
    if (typeof body.branch !== 'string') {
      return { ok: false, response: NextResponse.json({ error: 'Branch must be a string' }, { status: 400 }) };
    }
    branch = body.branch.trim();
    if (!branch || branch.length > 255 || /[\u0000-\u001f\u007f]/.test(branch)) {
      return { ok: false, response: NextResponse.json({ error: 'Branch is invalid' }, { status: 400 }) };
    }
  }
  return { ok: true, user, body, ...(branch ? { branch } : {}) };
}
