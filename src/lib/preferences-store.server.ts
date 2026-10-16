import { requestDataWorker } from './data-worker-client.server';

export type StoredPreferences = {
  preferences: Record<string, unknown> | null;
  revision: number;
};

export async function loadStoredPreferences(
  uid: string
): Promise<StoredPreferences> {
  return requestDataWorker<StoredPreferences>('/v1/preferences', {
    method: 'GET',
    userId: uid,
  });
}

export async function saveStoredPreferences(
  uid: string,
  preferences: Record<string, unknown>,
  revision: number
): Promise<StoredPreferences> {
  return requestDataWorker<StoredPreferences>('/v1/preferences', {
    method: 'PUT',
    userId: uid,
    body: { preferences, revision },
  });
}
