import { authClient } from './auth-client';

export async function getCurrentAuthToken(): Promise<string | null> {
  if (process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED !== 'true') return null;

  let session: Awaited<ReturnType<typeof authClient.getSession>>;
  try {
    session = await authClient.getSession();
  } catch {
    console.error('Failed to check Better Auth session');
    throw new Error('Better Auth session could not be checked');
  }

  if (session.error) {
    console.error('Failed to check Better Auth session');
    throw new Error('Better Auth session could not be checked');
  }
  if (!session.data?.user) return null;

  try {
    const token = await authClient.token();
    if (
      !token.error &&
      typeof token.data?.token === 'string' &&
      token.data.token.length > 0
    ) {
      return token.data.token;
    }
  } catch {
    // Report a safe diagnostic below without exposing provider response data.
  }

  console.error('Failed to read Better Auth API token');
  throw new Error('Better Auth API token could not be obtained');
}

export async function getAuthHeaders(
  headers?: HeadersInit
): Promise<HeadersInit> {
  const token = await getCurrentAuthToken();
  const nextHeaders = new Headers(headers);

  if (token) nextHeaders.set('Authorization', `Bearer ${token}`);
  return nextHeaders;
}
