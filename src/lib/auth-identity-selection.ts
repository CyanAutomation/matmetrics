import type { AuthenticatedUser } from './types';

export type BetterAuthSessionState =
  'disabled' | 'pending' | 'unavailable' | 'anonymous' | 'authenticated';

export type ActiveAuthIdentity = {
  status: 'pending' | 'unavailable' | 'conflict' | 'guest' | 'authenticated';
  provider: 'firebase' | 'better-auth' | null;
  user: AuthenticatedUser | null;
};

export function selectActiveAuthIdentity(input: {
  betterAuthEnabled: boolean;
  betterAuthState: BetterAuthSessionState;
  betterAuthUser: AuthenticatedUser | null;
  firebaseUser: AuthenticatedUser | null;
}): ActiveAuthIdentity {
  if (!input.betterAuthEnabled || input.betterAuthState === 'disabled') {
    return input.firebaseUser
      ? {
          status: 'authenticated',
          provider: 'firebase',
          user: input.firebaseUser,
        }
      : { status: 'guest', provider: null, user: null };
  }

  if (input.betterAuthState === 'pending') {
    return { status: 'pending', provider: null, user: null };
  }

  if (input.betterAuthState === 'unavailable') {
    return { status: 'unavailable', provider: null, user: null };
  }

  if (input.betterAuthUser) {
    if (
      input.firebaseUser &&
      input.firebaseUser.uid !== input.betterAuthUser.uid
    ) {
      return { status: 'conflict', provider: null, user: null };
    }

    return {
      status: 'authenticated',
      provider: 'better-auth',
      user: input.betterAuthUser,
    };
  }

  return input.firebaseUser
    ? {
        status: 'authenticated',
        provider: 'firebase',
        user: input.firebaseUser,
      }
    : { status: 'guest', provider: null, user: null };
}

export function selectUserScopedValue<T>(input: {
  activeUserId: string | null;
  ownerUserId: string | null;
  ready: boolean;
  value: T;
  fallback: T;
}): T {
  return input.ready &&
    input.activeUserId !== null &&
    input.ownerUserId === input.activeUserId
    ? input.value
    : input.fallback;
}
