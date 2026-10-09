export type PasskeyRegistrationPath =
  'firebase-enrolment' | 'authenticated-enrolment' | 'new-account';

export type PasskeyRegistrationPolicy = {
  enrolmentEnabled: boolean;
  signupEnabled: boolean;
};

export function isPasskeyRegistrationAllowed(
  path: PasskeyRegistrationPath,
  policy: PasskeyRegistrationPolicy
): boolean {
  return path === 'new-account'
    ? policy.signupEnabled
    : policy.enrolmentEnabled;
}
