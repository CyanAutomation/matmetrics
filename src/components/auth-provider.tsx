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
import { getFirebaseAuth, isFirebaseConfigured } from '@/lib/firebase-client';
import { setActiveUserId } from '@/lib/client-identity';
import {
  clearUserPreferencesState,
  getCurrentPreferences,
  initializeUserPreferences,
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
  authMode: 'authenticated' | 'guest';
  authAvailable: boolean;
  canUseAi: boolean;
  canUseGitHubSync: boolean;
  canSavePreferences: boolean;
  retryPreferencesLoad: () => Promise<void>;
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

function toAuthenticatedUser(user: User): AuthenticatedUser {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authReady, setAuthReady] = useState(false);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [preferencesError, setPreferencesError] = useState<Error | null>(null);
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [preferences, setPreferences] = useState(getCurrentPreferences());
  const isConfigured = isFirebaseConfigured();
  const authLoadGenerationRef = useRef(0);

  const loadPreferencesForUser = useCallback(
    async (uid: string, generation: number): Promise<void> => {
      setPreferencesReady(false);
      setPreferencesError(null);

      try {
        await initializeUserPreferences(uid, {
          shouldApply: () => authLoadGenerationRef.current === generation,
        });
      } catch (error) {
        if (authLoadGenerationRef.current === generation) {
          setPreferencesError(
            error instanceof Error
              ? error
              : new Error('Failed to load saved preferences')
          );
        }
      } finally {
        if (authLoadGenerationRef.current === generation) {
          setPreferencesReady(true);
          setAuthReady(true);
        }
      }
    },
    []
  );

  useEffect(() => {
    const unsubscribePreferences = subscribeToPreferences((nextPreferences) => {
      setPreferences(nextPreferences);
    });

    if (!isConfigured) {
      setAuthReady(true);
      setPreferencesReady(true);
      return () => {
        unsubscribePreferences();
      };
    }

    const auth = getFirebaseAuth();
    const unsubscribeAuth = onAuthStateChanged(auth, async (nextUser) => {
      const generation = ++authLoadGenerationRef.current;

      if (!nextUser) {
        setActiveUserId(null);
        clearUserPreferencesState();
        setUser(null);
        setPreferencesError(null);
        setPreferencesReady(true);
        setAuthReady(true);
        return;
      }

      setActiveUserId(nextUser.uid);
      setUser(toAuthenticatedUser(nextUser));
      await loadPreferencesForUser(nextUser.uid, generation);
    });

    return () => {
      unsubscribeAuth();
      unsubscribePreferences();
    };
  }, [isConfigured, loadPreferencesForUser]);

  const value = useMemo<AuthContextValue>(
    () => ({
      authReady,
      preferencesReady,
      preferencesError,
      user,
      preferences,
      isConfigured,
      authMode: user ? 'authenticated' : 'guest',
      authAvailable: isConfigured,
      canUseAi: !!user && isConfigured,
      canUseGitHubSync: !!user && isConfigured,
      canSavePreferences: !!user && isConfigured,
      async retryPreferencesLoad() {
        if (!user) {
          return;
        }

        const generation = ++authLoadGenerationRef.current;
        await loadPreferencesForUser(user.uid, generation);
      },
      async signInWithGoogle() {
        await signInWithPopup(getFirebaseAuth(), new GoogleAuthProvider());
      },
      async signInWithGitHub() {
        await signInWithPopup(getFirebaseAuth(), new GithubAuthProvider());
      },
      async signInWithEmail(email: string, password: string) {
        await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
      },
      async signUpWithEmail(name: string, email: string, password: string) {
        const credentials = await createUserWithEmailAndPassword(
          getFirebaseAuth(),
          email,
          password
        );
        if (name.trim()) {
          await updateProfile(credentials.user, { displayName: name.trim() });
          await reload(credentials.user);
          setUser(toAuthenticatedUser(credentials.user));
        }
      },
      async sendPasswordReset(email: string) {
        await sendPasswordResetEmail(getFirebaseAuth(), email);
      },
      async signOutUser() {
        await signOut(getFirebaseAuth());
      },
    }),
    [
      authReady,
      isConfigured,
      preferences,
      preferencesError,
      preferencesReady,
      user,
      loadPreferencesForUser,
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
