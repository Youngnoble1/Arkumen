import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { 
  initializeFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  limit, 
  onSnapshot, 
  getDocFromServer,
  enableIndexedDbPersistence,
  CACHE_SIZE_UNLIMITED
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const databaseId = (firebaseConfig as any).firestoreDatabaseId;
console.log("Initializing Firestore with Database ID:", databaseId || '(default)');

export const db = databaseId 
  ? initializeFirestore(app, { 
      experimentalForceLongPolling: true,
      localCache: {
        kind: 'persistent',
        cacheSizeBytes: CACHE_SIZE_UNLIMITED
      }
    }, databaseId)
  : initializeFirestore(app, { 
      experimentalForceLongPolling: true,
      localCache: {
        kind: 'persistent',
        cacheSizeBytes: CACHE_SIZE_UNLIMITED
      }
    });

// Attempt to enable persistence for older SDK style compatibility if needed, 
// though the initializeFirestore above handles it in newer SDKs.
try {
  enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
      console.warn('Multiple tabs open, persistence can only be enabled in one tab at a time.');
    } else if (err.code === 'unimplemented') {
      console.warn('The current browser does not support all of the features required to enable persistence');
    }
  });
} catch (e) {
  // Persistence might already be enabled via localCache config
}

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Error handling helper
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Connection test
async function testConnection() {
  const targetPath = 'test/connection';
  console.log(`Testing Firestore connection to ${targetPath}...`);
  try {
    const snap = await getDocFromServer(doc(db, 'test', 'connection'));
    console.log("Firestore connection check completed successfully. Document exists:", snap.exists());
  } catch (error) {
    if(error instanceof Error) {
      console.error("Firestore Connection Test Error (Path: " + targetPath + "):", error.message);
      if (error.message.includes('the client is offline') || error.message.includes('Could not reach Cloud Firestore')) {
        console.error("Connectivity issue detected. This usually means the browser is unable to reach Firestore endpoints. experimentalForceLongPolling is enabled.");
      } else if (error.message.includes('insufficient permissions')) {
        console.error("Security Rule issue detected. Verification of rules deployment is recommended.");
      }
    }
  }
}
setTimeout(testConnection, 3000);
