import assert from 'node:assert/strict';
import test from 'node:test';

import { deleteApp, getApps } from 'firebase/app';
import { getFirebaseAuth } from '@/lib/firebase-client';

test('getFirebaseAuth registers Auth on the initialized client Firebase app', async () => {
  const firebaseEnv = {
    NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID:
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
  const existingApps = new Set(getApps());

  Object.assign(process.env, {
    NEXT_PUBLIC_FIREBASE_API_KEY: 'test-api-key',
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'matmetrics.test',
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'matmetrics-auth-test',
    NEXT_PUBLIC_FIREBASE_APP_ID: 'test-app-id',
  });

  try {
    const auth = getFirebaseAuth();
    assert.equal(auth.app.options.projectId, 'matmetrics-auth-test');
  } finally {
    await Promise.all(
      getApps()
        .filter((app) => !existingApps.has(app))
        .map((app) => deleteApp(app))
    );

    for (const [key, value] of Object.entries(firebaseEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
