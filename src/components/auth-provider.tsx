"use client"

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth";
import { getFirebaseAuth, isFirebaseConfigured } from "@/lib/firebase-client";
import { setActiveUserId } from "@/lib/client-identity";
import {
  clearUserPreferencesState,
  getCurrentPreferences,
  initializeUserPreferences,
  subscribeToPreferences,
} from "@/lib/user-preferences";
import type { AuthenticatedUser, UserPreferences } from "@/lib/types";

type AuthContextValue = {
  authReady: boolean;
  preferencesReady: boolean;
  user: AuthenticatedUser | null;
  preferences: UserPreferences;
  isConfigured: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (name: string, email: string, password: string) => Promise<void>;
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
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [preferences, setPreferences] = useState(getCurrentPreferences());
  const isConfigured = isFirebaseConfigured();

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
      if (!nextUser) {
        setActiveUserId(null);
        clearUserPreferencesState();
        setUser(null);
        setPreferencesReady(true);
        setAuthReady(true);
        return;
      }

      setActiveUserId(nextUser.uid);
      setUser(toAuthenticatedUser(nextUser));
      setPreferencesReady(false);

      try {
        await initializeUserPreferences(nextUser.uid);
      } finally {
        setPreferencesReady(true);
        setAuthReady(true);
      }
    });

    return () => {
      unsubscribeAuth();
      unsubscribePreferences();
    };
  }, [isConfigured]);

  const value = useMemo<AuthContextValue>(() => ({
    authReady,
    preferencesReady,
    user,
    preferences,
    isConfigured,
    async signInWithGoogle() {
      await signInWithPopup(getFirebaseAuth(), new GoogleAuthProvider());
    },
    async signInWithEmail(email: string, password: string) {
      await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
    },
    async signUpWithEmail(name: string, email: string, password: string) {
      const credentials = await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
      if (name.trim()) {
        await updateProfile(credentials.user, { displayName: name.trim() });
      }
    },
    async sendPasswordReset(email: string) {
      await sendPasswordResetEmail(getFirebaseAuth(), email);
    },
    async signOutUser() {
      await signOut(getFirebaseAuth());
    },
  }), [authReady, isConfigured, preferences, preferencesReady, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
