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
  memoryLocalCache,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const databaseId = (firebaseConfig as any).firestoreDatabaseId;
console.log("Initializing Firestore with Database ID:", databaseId || '(default)');

const firestoreSettings = {
  experimentalForceLongPolling: true,
  useFetchStreams: false,
  localCache: memoryLocalCache(),
};

export const db = databaseId 
  ? initializeFirestore(app, firestoreSettings, databaseId)
  : initializeFirestore(app, firestoreSettings);

// Persistence is handled by memoryLocalCache() now to avoid iframe issues.

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
  console.log(`Verifying Firestore reachability (Target: ${targetPath})...`);
  try {
    // We use getDocFromServer to bypass cache and force a network check
    const snap = await getDocFromServer(doc(db, 'test', 'connection'));
    console.log("Firestore reachability test: SUCCESS. Connection established.");
  } catch (error) {
    if(error instanceof Error) {
      if (error.message.includes('the client is offline') || error.message.includes('Could not reach Cloud Firestore')) {
        console.warn("Firestore reachability test: PENDING/OFFLINE. The client is currently operating in offline mode. This is common during initial boot or in restricted network environments.");
        console.info("Info: experimentalForceLongPolling is active. If this persists beyond 30 seconds, please check your network connection or Firebase Project configuration.");
      } else if (error.message.includes('insufficient permissions')) {
        console.warn("Firestore reachability test: PERMISSION_DENIED. Reachability is confirmed, but access was blocked. This indicates the database is reachable but requires correct security rules for 'test/connection'.");
      } else {
        console.error("Firestore reachability test: FAILED.", error.message);
      }
    }
  }
}
// Run connection test with a slight delay to allow Auth to initialize
setTimeout(testConnection, 5000);
