import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createPasskeyRegistrationContext } from '@/lib/passkey-registration-context';
import { isFirebaseAdminConfigured } from '@/lib/firebase-admin';
import { requireAuthenticatedUser } from '@/lib/server-auth';
import { isPasskeyRegistrationAllowed } from '@/lib/passkey-policy';

export const runtime = 'nodejs';

const requestSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('firebase') }).strict(),
  z
    .object({
      mode: z.literal('new'),
      email: z.email().max(254),
      name: z.string().trim().min(1).max(100),
    })
    .strict(),
]);

function contextSecret(): string | null {
  const secret = process.env.MATMETRICS_AUTH_CONTEXT_SECRET;
  return secret && secret.length >= 32 ? secret : null;
}

function configurationError(): NextResponse {
  return NextResponse.json(
    { error: 'Passkey registration is not configured' },
    { status: 503, headers: { 'Cache-Control': 'no-store' } }
  );
}

function featureDisabledError(): NextResponse {
  return NextResponse.json(
    { error: 'Passkey registration is disabled' },
    { status: 503, headers: { 'Cache-Control': 'no-store' } }
  );
}

function registrationDisabledError(): NextResponse {
  return NextResponse.json(
    { error: 'Passkey registration is disabled' },
    { status: 503, headers: { 'Cache-Control': 'no-store' } }
  );
}

async function readBoundedJson(request: NextRequest): Promise<unknown> {
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > 4096) {
    throw new Error('Request body is too large');
  }
  if (
    !request.headers
      .get('content-type')
      ?.toLowerCase()
      .includes('application/json')
  ) {
    throw new Error('Expected a JSON request');
  }

  const reader = request.body?.getReader();
  if (!reader) throw new Error('Request body is missing');
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > 4096) {
      await reader.cancel();
      throw new Error('Request body is too large');
    }
    chunks.push(value);
  }

  const body = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(body));
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED !== 'true') {
    return featureDisabledError();
  }

  const secret = contextSecret();
  if (!secret) return configurationError();

  let body: unknown;
  try {
    body = await readBoundedJson(request);
  } catch {
    return NextResponse.json(
      { error: 'Invalid registration request' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid registration request' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  let claims: Parameters<typeof createPasskeyRegistrationContext>[0];
  if (parsed.data.mode === 'firebase') {
    if (
      !isPasskeyRegistrationAllowed('firebase-enrolment', {
        enrolmentEnabled:
          process.env.MATMETRICS_PASSKEY_ENROLMENT_ENABLED === 'true',
        signupEnabled: process.env.MATMETRICS_PASSKEY_SIGNUP_ENABLED === 'true',
      })
    ) {
      return registrationDisabledError();
    }
    if (!isFirebaseAdminConfigured()) return configurationError();

    const verified = await requireAuthenticatedUser(request);
    if ('status' in verified) return verified;
    if (verified.provider !== 'firebase') {
      return NextResponse.json(
        { error: 'Use the existing Firebase session to link this account.' },
        { status: 409, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const email = verified.email?.trim().toLowerCase();
    if (!email) {
      return NextResponse.json(
        {
          error:
            'Add an email address to your existing account before registering a passkey.',
        },
        { status: 409, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    claims = {
      appUserId: verified.appUserId,
      provider: 'firebase',
      providerSubject: verified.userId,
      email,
      name: verified.displayName?.trim() || email,
      emailVerified: verified.emailVerified,
    };
  } else {
    if (
      !isPasskeyRegistrationAllowed('new-account', {
        enrolmentEnabled:
          process.env.MATMETRICS_PASSKEY_ENROLMENT_ENABLED === 'true',
        signupEnabled: process.env.MATMETRICS_PASSKEY_SIGNUP_ENABLED === 'true',
      })
    ) {
      return registrationDisabledError();
    }
    if (!isFirebaseAdminConfigured()) return configurationError();

    const email = parsed.data.email.trim().toLowerCase();
    let firebaseUserExists = false;
    try {
      const { getFirebaseAdminAuth } = await import(
        '@/lib/firebase-admin-auth'
      );
      await getFirebaseAdminAuth().getUserByEmail(email);
      firebaseUserExists = true;
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'auth/user-not-found'
      ) {
        firebaseUserExists = false;
      } else {
        return configurationError();
      }
    }

    if (firebaseUserExists) {
      return NextResponse.json(
        {
          error:
            'This address may belong to an existing account. Sign in to that account before adding a passkey.',
        },
        { status: 409, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const appUserId = crypto.randomUUID();
    claims = {
      appUserId,
      provider: 'better-auth',
      providerSubject: appUserId,
      email,
      name: parsed.data.name.trim(),
      emailVerified: false,
    };
  }

  try {
    const context = await createPasskeyRegistrationContext(claims, secret);
    return NextResponse.json(
      { context },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch {
    return configurationError();
  }
}
