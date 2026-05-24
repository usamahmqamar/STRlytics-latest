/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { initializeFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfigJson from '../../firebase-applet-config.json';

// Use environment variables if available, otherwise fallback to the applet config
console.log("Firebase service initializing...");
const config = (firebaseConfigJson && typeof firebaseConfigJson === 'object') ? firebaseConfigJson : {} as any;

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
  // Using initializeFirestore instead of getFirestore to enable long polling
  // to avoid 'client is offline' issues in restricted network environments.
  db = initializeFirestore(app, {
    experimentalForceLongPolling: true,
  }, firestoreDatabaseId);
  auth = getAuth(app);
} catch (error) {
  console.error("Firebase initialization failed:", error);
}

export { db, auth, googleProvider };

// Test connection
async function testConnection() {
  if (!db) return;
  try {
    // Try to get a doc to verify connection. Path match expected in rules.
    await getDocFromServer(doc(db, '_connection_test_', 'ping'));
    console.log("Firebase connection test successful.");
  } catch (error) {
    if (error instanceof Error && (error.message.includes('offline') || error.message.includes('Failed to get document'))) {
      console.warn("Firestore connection check: Client may still be establishing connection or is offline.");
    } else {
      console.error("Firebase Connection Test Error:", error);
    }
  }
}
testConnection();
