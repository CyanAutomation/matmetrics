export type PasskeyRegistrationPolicy = {
  enrolmentEnabled: boolean;
};

export function isPasskeyRegistrationAllowed(
  policy: PasskeyRegistrationPolicy
): boolean {
  return policy.enrolmentEnabled;
}
