import {
  isDataWorkerConfigured,
  requestDataWorker,
} from './data-worker-client.server';
import {
  getFirebaseAdminDb,
  isFirebaseAdminConfigured,
} from './firebase-admin';

export type StoredPreferences = {
  preferences: Record<string, unknown> | null;
  revision: number;
};

function preferencesDocument(uid: string) {
  return getFirebaseAdminDb()
    .collection('users')
    .doc(uid)
    .collection('preferences')
    .doc('app');
}

export async function loadStoredPreferences(
  uid: string
): Promise<StoredPreferences> {
  if (isDataWorkerConfigured()) {
    return requestDataWorker<StoredPreferences>('/v1/preferences', {
      method: 'GET',
      userId: uid,
    });
  }
  if (!isFirebaseAdminConfigured()) {
    throw new Error('No preference data store is configured');
  }
  const snapshot = await preferencesDocument(uid).get();
  return {
    preferences: snapshot.exists
      ? (snapshot.data() as Record<string, unknown>)
      : null,
    revision: 0,
  };
}

export async function saveStoredPreferences(
  uid: string,
  preferences: Record<string, unknown>,
  revision: number
): Promise<StoredPreferences> {
  if (isDataWorkerConfigured()) {
    return requestDataWorker<StoredPreferences>('/v1/preferences', {
      method: 'PUT',
      userId: uid,
      body: { preferences, revision },
    });
  }
  if (!isFirebaseAdminConfigured()) {
    throw new Error('No preference data store is configured');
  }
  await preferencesDocument(uid).set(
    { ...preferences, updatedAt: new Date().toISOString() },
    { merge: true }
  );
  return { preferences, revision: revision + 1 };
}
