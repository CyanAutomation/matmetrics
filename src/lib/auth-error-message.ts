const NETWORK_AUTH_ERROR = /auth\/network-request-failed|network request failed/i;

export function getAuthErrorMessage(
  error: unknown,
  fallback = 'Authentication failed. Please try again.'
): string {
  const message = error instanceof Error ? error.message : '';

  if (NETWORK_AUTH_ERROR.test(message)) {
    return 'Unable to reach the sign-in service. Check your connection and try again.';
  }

  return message || fallback;
}
