import {
  getApps,
  initializeApp,
  cert,
  getApp,
  type App,
} from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

type ServiceAccountShape = {
  project_id: string;
  client_email: string;
  private_key: string;
};

let hasLoggedInvalidServiceAccount = false;

function logInvalidServiceAccount(message: string, error?: unknown): void {
  if (hasLoggedInvalidServiceAccount) {
    return;
  }

  hasLoggedInvalidServiceAccount = true;
  console.error(message, error);
}

export function parseServiceAccountKey(
  raw: string | undefined
): ServiceAccountShape | null {
  if (!raw) {
    return null;
  }

  let parsed: Partial<ServiceAccountShape>;

  try {
    parsed = JSON.parse(raw) as Partial<ServiceAccountShape>;
  } catch (error) {
    logInvalidServiceAccount(
      'FIREBASE_SERVICE_ACCOUNT_KEY contains malformed JSON.',
      error
    );
    return null;
  }

  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    logInvalidServiceAccount(
      'FIREBASE_SERVICE_ACCOUNT_KEY is missing required service account fields.'
    );
    return null;
  }

  return {
    project_id: parsed.project_id,
    client_email: parsed.client_email,
    private_key: parsed.private_key.replace(/\\n/g, '\n'),
  };
}

function getServiceAccount(): ServiceAccountShape | null {
  return parseServiceAccountKey(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
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

export function getFirebaseAdminDb(): Firestore {
  return getFirestore(getFirebaseAdminApp());
}
