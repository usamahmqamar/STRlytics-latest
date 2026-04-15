/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfigJson from '../../firebase-applet-config.json';

// Use environment variables if available, otherwise fallback to the applet config
console.log("Firebase service initializing...");
const config = (firebaseConfigJson && typeof firebaseConfigJson === 'object') ? firebaseConfigJson : {} as any;
console.log("Firebase config loaded:", config.projectId ? "Yes" : "No");

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || config.apiKey || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || config.authDomain || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || config.projectId || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || config.storageBucket || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || config.messagingSenderId || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || config.appId || '',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || config.measurementId || '',
};

const firestoreDatabaseId = import.meta.env.VITE_FIRESTORE_DATABASE_ID || config.firestoreDatabaseId || '(default)';

let app;
let db: any;
let auth: any;
const googleProvider = new GoogleAuthProvider();

try {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app, firestoreDatabaseId);
  auth = getAuth(app);
} catch (error) {
  console.error("Firebase initialization failed:", error);
  // Fallback to empty objects or handle gracefully in components
}

export { db, auth, googleProvider };

// Test connection
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
testConnection();
