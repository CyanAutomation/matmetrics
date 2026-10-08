export class AuthConfigurationError extends Error {
  readonly code = 'AUTH_CONFIGURATION';

  constructor() {
    super('Authentication service is not configured. Contact the site administrator.');
    this.name = 'AuthConfigurationError';
  }
}
