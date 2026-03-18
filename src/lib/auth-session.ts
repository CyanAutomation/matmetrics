import { getFirebaseAuth } from "./firebase-client";

export async function getCurrentIdToken(): Promise<string | null> {
  try {
    const currentUser = getFirebaseAuth().currentUser;
    return currentUser ? await currentUser.getIdToken() : null;
  } catch (error) {
    console.error("Failed to read Firebase ID token", error);
    return null;
  }
}

export async function getAuthHeaders(headers?: HeadersInit): Promise<HeadersInit> {
  const token = await getCurrentIdToken();
  const nextHeaders = new Headers(headers);

  if (token) {
    nextHeaders.set("Authorization", `Bearer ${token}`);
  }

  return nextHeaders;
}
