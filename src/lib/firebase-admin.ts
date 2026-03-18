import {
  getApps,
  initializeApp,
  cert,
  getApp,
  type App,
} from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';

type ServiceAccountShape = {
  project_id: string;
  client_email: string;
  private_key: string;
};

function getServiceAccount(): ServiceAccountShape | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    return null;
  }

  const parsed = JSON.parse(raw) as Partial<ServiceAccountShape>;
  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    return null;
  }

  return {
    project_id: parsed.project_id,
    client_email: parsed.client_email,
    private_key: parsed.private_key.replace(/\\n/g, '\n'),
  };
}

export function isFirebaseAdminConfigured(): boolean {
  return getServiceAccount() !== null;
}

function getFirebaseAdminApp(): App {
  const serviceAccount = getServiceAccount();
  if (!serviceAccount) {
    throw new Error('Firebase admin configuration is missing');
  }

  return getApps().length > 0
    ? getApp()
    : initializeApp({
        credential: cert({
          projectId: serviceAccount.project_id,
          clientEmail: serviceAccount.client_email,
          privateKey: serviceAccount.private_key,
        }),
      });
}

export function getFirebaseAdminAuth(): Auth {
  return getAuth(getFirebaseAdminApp());
}
