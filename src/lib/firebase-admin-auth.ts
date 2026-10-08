import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirebaseAdminApp } from './firebase-admin';

export function getFirebaseAdminAuth(): Auth {
  return getAuth(getFirebaseAdminApp());
}
