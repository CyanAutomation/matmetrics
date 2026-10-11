'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { authClient } from '@/lib/auth-client';
import { getCurrentAuthToken } from '@/lib/auth-session';
import { setActiveUserId } from '@/lib/client-identity';
import {
  isUserScopedValueReady,
  selectUserScopedValue,
} from '@/lib/auth-identity-selection';
import {
  clearUserPreferencesState,
  DEFAULT_USER_PREFERENCES,
  getCurrentPreferences,
  initializeUserPreferences,
  PreferenceRequestError,
  subscribeToPreferences,
} from '@/lib/user-preferences';
import type { AuthenticatedUser, UserPreferences } from '@/lib/types';

type AuthContextValue = {
  authReady: boolean;
  preferencesReady: boolean;
  preferencesError: Error | null;
  user: AuthenticatedUser | null;
  preferences: UserPreferences;
  isConfigured: boolean;
  betterAuthConfigured: boolean;
  emailPasswordSignupEnabled: boolean;
  passkeyEnrolmentEnabled: boolean;
  hasBetterAuthSession: boolean;
  authMode: 'authenticated' | 'guest';
  authAvailable: boolean;
  canUseAi: boolean;
  canUseGitHubSync: boolean;
  canSavePreferences: boolean;
  getAuthToken: () => Promise<string | null>;
  retryPreferencesLoad: () => Promise<void>;
  signInWithPasskey: () => Promise<void>;
  addPasskey: (name: string) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (
    name: string,
    email: string,
    password: string
  ) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  sendEmailVerification: (email: string) => Promise<void>;
  resetPassword: (token: string, newPassword: string) => Promise<void>;
  signOutUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const betterAuthConfigured =
  process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED === 'true';
const emailPasswordSignupEnabled =
  betterAuthConfigured &&
  process.env.NEXT_PUBLIC_EMAIL_PASSWORD_SIGNUP_ENABLED === 'true';
const passkeyEnrolmentEnabled =
  betterAuthConfigured &&
  process.env.NEXT_PUBLIC_PASSKEY_ENROLMENT_ENABLED === 'true';

function toBetterAuthUser(user: {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string;
  image?: string | null;
}): AuthenticatedUser {
  return {
    // Existing account IDs were carried into Better Auth during migration, so
    // the Better Auth user ID remains the stable MatMetrics account key.
    uid: user.id,
    email: user.email,
    emailVerified: user.emailVerified,
    displayName: user.name,
    photoURL: user.image ?? null,
  };
}

async function assertAuthClientResult(
  result: { error?: { message?: string } | null },
  fallback: string
): Promise<void> {
  if (result.error) throw new Error(result.error.message || fallback);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [preferencesError, setPreferencesError] = useState<Error | null>(null);
  const [preferences, setPreferences] = useState(getCurrentPreferences());
  const [preferencesOwnerId, setPreferencesOwnerId] = useState<string | null>(
    null
  );
  const preferencesIdentityRef = useRef<string | null>(null);
  const {
    data: passkeySession,
    isPending: passkeySessionPending,
  } = authClient.useSession();
  const authLoadGenerationRef = useRef(0);

  const user = betterAuthConfigured && passkeySession?.user
    ? toBetterAuthUser(passkeySession.user)
    : null;
  const hasBetterAuthSession = !!user;
  const isConfigured = betterAuthConfigured;
  const authReady = !betterAuthConfigured || !passkeySessionPending;

  const getAuthToken = useCallback(async (): Promise<string | null> => {
    return getCurrentAuthToken();
  }, []);

  const loadPreferencesForUser = useCallback(
    async (uid: string, generation: number): Promise<void> => {
      setPreferencesReady(false);
      setPreferencesError(null);

      try {
        await initializeUserPreferences(uid, {
          shouldApply: () => authLoadGenerationRef.current === generation,
        });
        if (authLoadGenerationRef.current === generation) {
          setPreferencesOwnerId(uid);
        }
      } catch (error) {
        if (authLoadGenerationRef.current === generation) {
          if (error instanceof PreferenceRequestError) {
            console.error('Saved preferences request failed', {
              method: error.method,
              stage: error.stage,
              status: error.status,
              code: error.code,
              category: error.category,
            });
          }
          setPreferencesError(
            error instanceof Error
              ? error
              : new Error('Failed to load saved preferences')
          );
        }
      } finally {
        if (authLoadGenerationRef.current === generation) {
          setPreferencesOwnerId(uid);
          setPreferencesReady(true);
        }
      }
    },
    []
  );

  useEffect(() => {
    const unsubscribePreferences = subscribeToPreferences((nextPreferences) => {
      setPreferences(nextPreferences);
    });
    return unsubscribePreferences;
  }, []);

  useEffect(() => {
    if (!authReady) return;
    const generation = ++authLoadGenerationRef.current;
    const currentUserId = user?.uid ?? null;
    if (!currentUserId) {
      preferencesIdentityRef.current = null;
      setActiveUserId(null);
      if (isConfigured) clearUserPreferencesState();
      setPreferencesOwnerId(null);
      setPreferencesError(null);
      setPreferencesReady(true);
      return;
    }

    if (preferencesIdentityRef.current !== currentUserId) {
      preferencesIdentityRef.current = currentUserId;
      setPreferencesOwnerId(null);
      clearUserPreferencesState();
    }
    setActiveUserId(currentUserId);
    void loadPreferencesForUser(currentUserId, generation);
  }, [authReady, isConfigured, loadPreferencesForUser, user?.uid]);

  const visiblePreferences = selectUserScopedValue({
    activeUserId: user?.uid ?? null,
    ownerUserId: preferencesOwnerId,
    ready: preferencesReady,
    value: preferences,
    fallback: DEFAULT_USER_PREFERENCES,
  });
  const preferencesReadyForActiveUser = isUserScopedValueReady({
    activeUserId: user?.uid ?? null,
    ownerUserId: preferencesOwnerId,
    ready: preferencesReady,
  });

  const value = useMemo<AuthContextValue>(
    () => ({
      authReady,
      preferencesReady: preferencesReadyForActiveUser,
      preferencesError,
      user,
      preferences: visiblePreferences,
      isConfigured,
      betterAuthConfigured,
      emailPasswordSignupEnabled,
      passkeyEnrolmentEnabled,
      hasBetterAuthSession,
      authMode: user ? 'authenticated' : 'guest',
      authAvailable: isConfigured,
      canUseAi: !!user && isConfigured,
      canUseGitHubSync: !!user && isConfigured,
      canSavePreferences: !!user && isConfigured,
      getAuthToken,
      async retryPreferencesLoad() {
        if (!user) return;
        const generation = ++authLoadGenerationRef.current;
        await loadPreferencesForUser(user.uid, generation);
      },
      async signInWithPasskey() {
        if (!betterAuthConfigured) {
          throw new Error('Passkey authentication is not configured');
        }
        const result = await authClient.signIn.passkey();
        await assertAuthClientResult(result, 'Passkey sign-in failed');
      },
      async addPasskey(name) {
        if (!passkeyEnrolmentEnabled) {
          throw new Error('Passkey enrolment is disabled');
        }
        if (!hasBetterAuthSession) {
          throw new Error('Sign in before adding a passkey');
        }
        const result = await authClient.passkey.addPasskey({
          name: name.trim() || 'Passkey',
          createSession: false,
        });
        await assertAuthClientResult(result, 'Passkey registration failed');
      },
      async signInWithEmail(email, password) {
        if (!betterAuthConfigured) {
          throw new Error('Better Auth is not configured');
        }
        const result = await authClient.signIn.email({ email, password });
        await assertAuthClientResult(result, 'Email sign-in failed');
      },
      async signUpWithEmail(name, email, password) {
        if (!emailPasswordSignupEnabled) {
          throw new Error('Email sign-up is disabled');
        }
        const result = await authClient.signUp.email({
          name: name.trim(),
          email,
          password,
          callbackURL: `${window.location.origin}/`,
        });
        await assertAuthClientResult(result, 'Account creation failed');
      },
      async sendPasswordReset(email) {
        if (!betterAuthConfigured) {
          throw new Error('Better Auth is not configured');
        }
        const result = await authClient.requestPasswordReset({
          email,
          redirectTo: `${window.location.origin}/reset-password`,
        });
        await assertAuthClientResult(
          result,
          'Could not request a password reset'
        );
      },
      async sendEmailVerification(email) {
        if (!betterAuthConfigured) {
          throw new Error('Better Auth is not configured');
        }
        const result = await authClient.sendVerificationEmail({
          email,
          callbackURL: `${window.location.origin}/`,
        });
        await assertAuthClientResult(
          result,
          'Could not request email verification'
        );
      },
      async resetPassword(token, newPassword) {
        if (!betterAuthConfigured) {
          throw new Error('Better Auth is not configured');
        }
        const result = await authClient.resetPassword({ newPassword, token });
        await assertAuthClientResult(result, 'Could not reset your password');
      },
      async signOutUser() {
        const result = await authClient.signOut();
        await assertAuthClientResult(result, 'Could not sign out');
      },
    }),
    [
      authReady,
      hasBetterAuthSession,
      getAuthToken,
      isConfigured,
      loadPreferencesForUser,
      visiblePreferences,
      preferencesError,
      preferencesReadyForActiveUser,
      user,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
}
