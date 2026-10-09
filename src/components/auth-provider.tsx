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
import {
  GithubAuthProvider,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  reload,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { authClient } from '@/lib/auth-client';
import { getCurrentIdToken } from '@/lib/auth-session';
import { getFirebaseAuth, isFirebaseConfigured } from '@/lib/firebase-client';
import { setActiveUserId } from '@/lib/client-identity';
import {
  selectActiveAuthIdentity,
  selectUserScopedValue,
} from '@/lib/auth-identity-selection';
import { isPasskeyRegistrationAllowed } from '@/lib/passkey-policy';
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
  firebaseConfigured: boolean;
  betterAuthConfigured: boolean;
  passkeyEnrolmentEnabled: boolean;
  passkeySignupEnabled: boolean;
  isPasskeySession: boolean;
  authMode: 'authenticated' | 'guest';
  authAvailable: boolean;
  canUseAi: boolean;
  canUseGitHubSync: boolean;
  canSavePreferences: boolean;
  getIdToken: () => Promise<string | null>;
  retryPreferencesLoad: () => Promise<void>;
  signInWithPasskey: () => Promise<void>;
  signUpWithPasskey: (name: string, email: string) => Promise<void>;
  addPasskey: (name: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithGitHub: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (
    name: string,
    email: string,
    password: string
  ) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  signOutUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const betterAuthConfigured =
  process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED === 'true';
const passkeyRegistrationPolicy = {
  enrolmentEnabled:
    process.env.NEXT_PUBLIC_PASSKEY_ENROLMENT_ENABLED === 'true',
  signupEnabled: process.env.NEXT_PUBLIC_PASSKEY_SIGNUP_ENABLED === 'true',
};
const passkeyEnrolmentEnabled =
  betterAuthConfigured &&
  isPasskeyRegistrationAllowed(
    'authenticated-enrolment',
    passkeyRegistrationPolicy
  );
const passkeySignupEnabled =
  betterAuthConfigured &&
  isPasskeyRegistrationAllowed('new-account', passkeyRegistrationPolicy);

function toAuthenticatedUser(user: User): AuthenticatedUser {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
  };
}

function toBetterAuthUser(user: {
  id: string;
  email: string;
  name: string;
  image?: string | null;
}): AuthenticatedUser {
  return {
    // This remains the stable MatMetrics account key for existing consumers.
    // For Firebase migrations the Better Auth user ID is deliberately the
    // original Firebase UID; new accounts use a random canonical ID.
    uid: user.id,
    email: user.email,
    displayName: user.name,
    photoURL: user.image ?? null,
  };
}

async function requestRegistrationContext(
  body: Record<string, string>,
  token?: string
): Promise<string> {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch('/api/passkey/registration-context', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const result = (await response.json()) as {
    context?: unknown;
    error?: unknown;
  };
  if (!response.ok || typeof result.context !== 'string') {
    throw new Error(
      typeof result.error === 'string'
        ? result.error
        : 'Could not start passkey registration'
    );
  }
  return result.context;
}

async function assertAuthClientResult(
  result: { error?: { message?: string } | null },
  fallback: string
): Promise<void> {
  if (result.error) throw new Error(result.error.message || fallback);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const firebaseConfigured = isFirebaseConfigured();
  const [firebaseReady, setFirebaseReady] = useState(!firebaseConfigured);
  const [firebaseUser, setFirebaseUser] = useState<AuthenticatedUser | null>(
    null
  );
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
    error: passkeySessionError,
  } = authClient.useSession();
  const authLoadGenerationRef = useRef(0);

  const betterAuthUser = passkeySession?.user
    ? toBetterAuthUser(passkeySession.user)
    : null;
  const activeIdentity = selectActiveAuthIdentity({
    betterAuthEnabled: betterAuthConfigured,
    betterAuthState: !betterAuthConfigured
      ? 'disabled'
      : passkeySessionPending
        ? 'pending'
        : passkeySessionError
          ? 'unavailable'
          : betterAuthUser
            ? 'authenticated'
            : 'anonymous',
    betterAuthUser,
    firebaseUser,
  });
  const user = activeIdentity.user;
  const isPasskeySession = activeIdentity.provider === 'better-auth';
  const isConfigured = firebaseConfigured || betterAuthConfigured;
  const authReady = firebaseReady && activeIdentity.status !== 'pending';

  const getIdToken = useCallback(async (): Promise<string | null> => {
    return getCurrentIdToken();
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
          setPreferencesReady(true);
        }
      }
    },
    []
  );

  useEffect(() => {
    if (!firebaseConfigured) {
      setFirebaseReady(true);
      return;
    }

    const unsubscribe = onAuthStateChanged(
      getFirebaseAuth(),
      (nextUser) => {
        setFirebaseUser(nextUser ? toAuthenticatedUser(nextUser) : null);
        setFirebaseReady(true);
      },
      (error) => {
        setFirebaseUser(null);
        setPreferencesError(
          error instanceof Error
            ? error
            : new Error('Failed to initialize authentication')
        );
        setFirebaseReady(true);
      }
    );

    return unsubscribe;
  }, [firebaseConfigured]);

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

  const clearBetterAuthSession = useCallback(async () => {
    if (!betterAuthConfigured) return;
    const result = await authClient.signOut();
    await assertAuthClientResult(
      result,
      'Could not switch authentication accounts'
    );
  }, []);

  const clearFirebaseSession = useCallback(async () => {
    if (!firebaseConfigured || !getFirebaseAuth().currentUser) return;
    await signOut(getFirebaseAuth());
  }, [firebaseConfigured]);

  const value = useMemo<AuthContextValue>(
    () => ({
      authReady,
      preferencesReady,
      preferencesError,
      user,
      preferences: visiblePreferences,
      isConfigured,
      firebaseConfigured,
      betterAuthConfigured,
      passkeyEnrolmentEnabled,
      passkeySignupEnabled,
      isPasskeySession,
      authMode: user ? 'authenticated' : 'guest',
      authAvailable: isConfigured,
      canUseAi: !!user && isConfigured,
      canUseGitHubSync: !!user && isConfigured,
      canSavePreferences: !!user && isConfigured,
      getIdToken,
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
        await clearFirebaseSession();
      },
      async signUpWithPasskey(name, email) {
        if (!passkeySignupEnabled) {
          throw new Error('New passkey registration is disabled');
        }
        const context = await requestRegistrationContext({
          mode: 'new',
          name,
          email,
        });
        const result = await authClient.passkey.addPasskey({
          name: 'Primary passkey',
          context,
          createSession: true,
        });
        await assertAuthClientResult(result, 'Passkey registration failed');
        await clearFirebaseSession();
      },
      async addPasskey(name) {
        if (!passkeyEnrolmentEnabled) {
          throw new Error('Passkey enrolment is disabled');
        }
        let context: string | undefined;
        let createSession = false;
        if (!isPasskeySession) {
          if (!firebaseConfigured) {
            throw new Error('Sign in before adding a passkey');
          }
          const token = await getFirebaseAuth().currentUser?.getIdToken();
          if (!token) throw new Error('Sign in to your existing account first');
          context = await requestRegistrationContext(
            { mode: 'firebase' },
            token
          );
          createSession = true;
        }
        const result = await authClient.passkey.addPasskey({
          name: name.trim() || 'Passkey',
          ...(context ? { context } : {}),
          createSession,
        });
        await assertAuthClientResult(result, 'Passkey registration failed');
      },
      async signInWithGoogle() {
        if (!firebaseConfigured) throw new Error('Firebase is not configured');
        await signInWithPopup(getFirebaseAuth(), new GoogleAuthProvider());
        await clearBetterAuthSession();
      },
      async signInWithGitHub() {
        if (!firebaseConfigured) throw new Error('Firebase is not configured');
        await signInWithPopup(getFirebaseAuth(), new GithubAuthProvider());
        await clearBetterAuthSession();
      },
      async signInWithEmail(email, password) {
        if (!firebaseConfigured) throw new Error('Firebase is not configured');
        await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
        await clearBetterAuthSession();
      },
      async signUpWithEmail(name, email, password) {
        if (!firebaseConfigured) throw new Error('Firebase is not configured');
        const credentials = await createUserWithEmailAndPassword(
          getFirebaseAuth(),
          email,
          password
        );
        if (name.trim()) {
          await updateProfile(credentials.user, { displayName: name.trim() });
          await reload(credentials.user);
          setFirebaseUser(toAuthenticatedUser(credentials.user));
        }
        await clearBetterAuthSession();
      },
      async sendPasswordReset(email) {
        if (!firebaseConfigured) throw new Error('Firebase is not configured');
        await sendPasswordResetEmail(getFirebaseAuth(), email);
      },
      async signOutUser() {
        const results = await Promise.allSettled([
          clearBetterAuthSession(),
          clearFirebaseSession(),
        ]);
        const failed = results.find((result) => result.status === 'rejected');
        if (failed?.status === 'rejected') throw failed.reason;
      },
    }),
    [
      authReady,
      firebaseConfigured,
      getIdToken,
      clearBetterAuthSession,
      clearFirebaseSession,
      isConfigured,
      loadPreferencesForUser,
      isPasskeySession,
      visiblePreferences,
      preferencesError,
      preferencesReady,
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
