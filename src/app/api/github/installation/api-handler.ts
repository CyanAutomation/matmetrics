import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/server-auth';
import {
  forwardSessionRequestToKeiko,
  isKeikoCutoverUser,
} from '@/lib/keiko-session-gateway.server';

async function authenticatedUser(request: NextRequest) {
  const user = await requireAuthenticatedUser(request);
  return user instanceof NextResponse ? user : user;
}

export async function GET(request: NextRequest) {
  const user = await authenticatedUser(request);
  if (user instanceof NextResponse) return user;
  if (!isKeikoCutoverUser(user.appUserId)) {
    return NextResponse.json({ cutover: false, connected: false, installation: null }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  }
  const response = await forwardSessionRequestToKeiko(request, user, {
    path: '/v1/backups/github-installation',
    method: 'GET',
    scope: 'backups:read',
  });
  const body = await response.text();
  if (response.ok) {
    try {
      const payload: unknown = JSON.parse(body);
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return NextResponse.json({ error: 'GitHub connection status is invalid' }, {
          status: 502,
          headers: { 'Cache-Control': 'no-store' },
        });
      }
      return NextResponse.json({ ...payload, cutover: true }, {
        status: response.status,
        headers: { 'Cache-Control': 'no-store' },
      });
    } catch {
      return NextResponse.json({ error: 'GitHub connection status is invalid' }, {
        status: 502,
        headers: { 'Cache-Control': 'no-store' },
      });
    }
  }
  return new NextResponse(body, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('content-type') ?? 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

export async function POST(request: NextRequest) {
  const user = await authenticatedUser(request);
  if (user instanceof NextResponse) return user;
  if (!isKeikoCutoverUser(user.appUserId)) {
    return NextResponse.json({ error: 'Keiko GitHub App connection is unavailable' }, { status: 404 });
  }
  return forwardSessionRequestToKeiko(request, user, {
    path: '/v1/backups/github-installation',
    method: 'POST',
    scope: 'backups:write',
    body: {},
  });
}

export async function DELETE(request: NextRequest) {
  const user = await authenticatedUser(request);
  if (user instanceof NextResponse) return user;
  if (!isKeikoCutoverUser(user.appUserId)) {
    return NextResponse.json({ error: 'Keiko GitHub App connection is unavailable' }, { status: 404 });
  }
  return forwardSessionRequestToKeiko(request, user, {
    path: '/v1/backups/github-installation',
    method: 'DELETE',
    scope: 'backups:write',
  });
}
