export class AuthConfigurationError extends Error {
  readonly code = 'AUTH_CONFIGURATION';

  constructor() {
    super('Authentication service is not configured. Contact the site administrator.');
    this.name = 'AuthConfigurationError';
  }
}

export class AuthVerificationUnavailableError extends Error {
  readonly code = 'AUTHENTICATION_UNAVAILABLE';

  constructor() {
    super('Authentication service is temporarily unavailable. Please try again.');
    this.name = 'AuthVerificationUnavailableError';
  }
}

export function isRemoteJwksUnavailable(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (
    error instanceof Error &&
    (error.name === 'AbortError' || error.name === 'TimeoutError')
  ) {
    return true;
  }

  if (
    !error ||
    typeof error !== 'object' ||
    !('code' in error) ||
    typeof error.code !== 'string'
  ) {
    return false;
  }
  return [
    'ERR_JWKS_TIMEOUT',
    'ERR_JOSE_GENERIC',
    'ERR_JWK_INVALID',
    'ERR_JWKS_INVALID',
    'ERR_JWKS_MULTIPLE_MATCHING_KEYS',
  ].includes(error.code);
}
