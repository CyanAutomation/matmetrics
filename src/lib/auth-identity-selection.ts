export function selectUserScopedValue<T>(input: {
  activeUserId: string | null;
  ownerUserId: string | null;
  ready: boolean;
  value: T;
  fallback: T;
}): T {
  const isReadyForActiveUser =
    isUserScopedValueReady(input) && input.activeUserId !== null;
  return isReadyForActiveUser ? input.value : input.fallback;
}

export function isUserScopedValueReady(input: {
  activeUserId: string | null;
  ownerUserId: string | null;
  ready: boolean;
}): boolean {
  return input.ready && input.ownerUserId === input.activeUserId;
}
