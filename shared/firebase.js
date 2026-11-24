/* ============================================================
   Father Flower: Firebase connection (integrator)
   Purpose: the ONE place the Firebase web config and SDK imports live.
   Every page imports { auth, db, storage, fs } from here.
   The web config below is not a secret; Firestore security rules protect the data.
   ============================================================ */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js';
import * as fs from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import * as st from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js';

export const firebaseConfig = {
  apiKey: 'AIzaSyBOtamYY1XTJhKEz0NwtfW1EOGKJ1r0Fk0',
  authDomain: 'father-flower.firebaseapp.com',
  projectId: 'father-flower',
  storageBucket: 'father-flower.firebasestorage.app',
  messagingSenderId: '988779093026',
  appId: '1:988779093026:web:6a10c081e64a302686fe7b',
  measurementId: 'G-XYC6TT7V5D'
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

/* Offline cache helps on weak school data connections. Falls back to memory if the browser blocks it.
   ignoreUndefinedProperties stops a stray undefined value from failing a whole save. */
let db;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    ignoreUndefinedProperties: true
  });
} catch (e) {
  try { db = initializeFirestore(app, { localCache: memoryLocalCache(), ignoreUndefinedProperties: true }); }
  catch (e2) { db = getFirestore(app); }
}
const storage = getStorage(app);

export { app, auth, db, storage, fs, st };
