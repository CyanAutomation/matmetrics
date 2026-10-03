import { getFirebaseAuth } from './firebase-client';
import { authClient } from './auth-client';

async function getCurrentIdToken(): Promise<string | null> {
  if (process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED === 'true') {
    try {
      const session = await authClient.getSession();
      if (session.data?.user) {
        const token = await authClient.token();
        if (token.data?.token) return token.data.token;
      }
    } catch (error) {
      console.error('Failed to read Better Auth API token');
    }
  }

  try {
    const currentUser = getFirebaseAuth().currentUser;
    return currentUser ? await currentUser.getIdToken() : null;
  } catch (error) {
    console.error('Failed to read Firebase ID token', error);
    return null;
  }
}

export async function getAuthHeaders(
  headers?: HeadersInit
): Promise<HeadersInit> {
  const token = await getCurrentIdToken();
  const nextHeaders = new Headers(headers);

  if (token) {
    nextHeaders.set('Authorization', `Bearer ${token}`);
  }

  return nextHeaders;
}
