export const PREFERENCE_API_ERROR_CODES = {
  authenticationRequired: 'AUTHENTICATION_REQUIRED',
  authenticationFailed: 'AUTHENTICATION_FAILED',
  authenticationUnavailable: 'AUTHENTICATION_UNAVAILABLE',
  authenticationConfiguration: 'AUTH_CONFIGURATION',
  storeConfiguration: 'PREFERENCE_STORE_CONFIGURATION',
  unavailable: 'PREFERENCES_UNAVAILABLE',
  conflict: 'PREFERENCE_CONFLICT',
  requestFailed: 'PREFERENCE_REQUEST_FAILED',
  invalidPayload: 'INVALID_PREFERENCE_PAYLOAD',
} as const;

export type PreferenceApiErrorCode =
  (typeof PREFERENCE_API_ERROR_CODES)[keyof typeof PREFERENCE_API_ERROR_CODES];

export type PreferenceFailureCategory =
  | 'authentication'
  | 'configuration'
  | 'unavailable'
  | 'request';

export function isPreferenceApiErrorCode(
  code: unknown
): code is PreferenceApiErrorCode {
  return (
    typeof code === 'string' &&
    Object.values(PREFERENCE_API_ERROR_CODES).includes(
      code as PreferenceApiErrorCode
    )
  );
}
