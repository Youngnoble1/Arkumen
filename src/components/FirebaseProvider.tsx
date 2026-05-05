import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot, setDoc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db, OperationType, handleFirestoreError } from '../firebase';
import { UserProfile } from '../types';

interface FirebaseContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAuthReady: boolean;
  isGuest: boolean;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  logout: () => Promise<void>;
}

const FirebaseContext = createContext<FirebaseContextType>({
  user: null,
  profile: null,
  loading: true,
  isAuthReady: false,
  isGuest: false,
  updateProfile: async () => {},
  logout: async () => {},
});

export const useFirebase = () => useContext(FirebaseContext);

const GUEST_PROFILE_KEY = 'arkumen_guest_profile';

const createDefaultProfile = (uid: string, username: string): UserProfile => ({
  uid,
  username,
  xp: 0,
  highestScore: 0,
  favoriteCategory: 'General',
  arkerTitle: 'Initiate',
  rank: 'Initiate',
  level: 1,
  createdAt: new Date().toISOString(),
  role: 'user',
  badges: [],
  stats: {
    totalGames: 0,
    totalWins: 0,
    modeStats: {},
    categoryStats: {},
  }
});

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isGuest, setIsGuest] = useState(false);

  const updateProfile = async (updates: Partial<UserProfile>) => {
    if (profile?.uid) {
      // Immediate local update for better UX and offline support
      const newProfile = { ...profile, ...updates };
      setProfile(newProfile);
      if (isGuest) {
        localStorage.setItem(GUEST_PROFILE_KEY, JSON.stringify(newProfile));
      }

      try {
        const userRef = doc(db, 'users', profile.uid);
        await updateDoc(userRef, updates);
      } catch (error) {
        // Log sparingly, as this is expected in offline mode
        console.warn("Profile sync deferred (offline). Local changes preserved.");
      }
    }
  };

  const logout = async () => {
    if (user) {
      await auth.signOut();
    } else {
      // For guests, we don't clear the record, we just reset or keep it.
      // The user wants it persisted. So we just navigate home or similar.
      // Actually, if they want to "logout" as a guest, they might want to sign in as someone else?
      // But standard logout for guest in this app context usually means "Exit Arena".
      // I'll leave the local ID intact so they can return.
    }
  };

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
      
      if (currentUser) {
        setIsGuest(false);
        const userDocRef = doc(db, 'users', currentUser.uid);
        
        try {
          const docSnap = await getDoc(userDocRef);
          if (!docSnap.exists()) {
            const newProfile = createDefaultProfile(currentUser.uid, currentUser.displayName || 'Arker');
            await setDoc(userDocRef, newProfile);
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, `users/${currentUser.uid}`);
        }

        const unsubscribeProfile = onSnapshot(userDocRef, (doc) => {
          if (doc.exists()) {
            setProfile(doc.data() as UserProfile);
          }
          setLoading(false);
        }, (error) => {
          handleFirestoreError(error, OperationType.GET, `users/${currentUser.uid}`);
        });

        return () => unsubscribeProfile();
      } else {
        // Guest Mode with Firestore Persistence
        const storedGuestStr = localStorage.getItem(GUEST_PROFILE_KEY);
        let guestData: UserProfile;

        if (storedGuestStr) {
          guestData = JSON.parse(storedGuestStr);
          setProfile(guestData); // Immediate UI update from local
        } else {
          const guestId = 'guest_' + Math.random().toString(36).substr(2, 9);
          guestData = createDefaultProfile(guestId, 'Guest Arker');
          localStorage.setItem(GUEST_PROFILE_KEY, JSON.stringify(guestData));
          setProfile(guestData);
        }

        const guestDocRef = doc(db, 'users', guestData.uid);
        setIsGuest(true);

        const syncGuest = async () => {
          try {
            // Check if exists, if not create
            const docSnap = await getDoc(guestDocRef);
            if (!docSnap.exists()) {
              await setDoc(guestDocRef, guestData);
            } else {
              // Merge if Firestore has newer data or just take it
              const firestoreData = docSnap.data() as UserProfile;
              setProfile(firestoreData);
              localStorage.setItem(GUEST_PROFILE_KEY, JSON.stringify(firestoreData));
            }
          } catch (error) {
            console.warn("Guest profile offline sync pending or restricted. Using local version.", error);
          }
        };

        syncGuest();

        const unsubscribeGuestProfile = onSnapshot(guestDocRef, (doc) => {
          if (doc.exists()) {
            const p = doc.data() as UserProfile;
            setProfile(p);
            localStorage.setItem(GUEST_PROFILE_KEY, JSON.stringify(p));
          }
          setLoading(false);
        }, (error) => {
          // If offline, we just use the local state we already set
          console.log("Guest profile onSnapshot offline hint", error.message);
          setLoading(false); 
        });

        return () => unsubscribeGuestProfile();
      }
    });

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!profile?.uid) return;

    const setOnlineStatus = async (status: boolean) => {
      try {
        const userRef = doc(db, 'users', profile.uid);
        await updateDoc(userRef, {
          isOnline: status,
          lastActive: new Date().toISOString()
        });
      } catch (e) {
        // Silently fail, likely offline or permission issue
      }
    };

    setOnlineStatus(true);

    const interval = setInterval(() => setOnlineStatus(true), 2 * 60 * 1000);

    const handleUnload = () => {
      setOnlineStatus(false);
    };

    window.addEventListener('beforeunload', handleUnload);

    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', handleUnload);
      setOnlineStatus(false);
    };
  }, [profile?.uid]);

  const contextValue = React.useMemo(() => ({
    user,
    profile,
    loading,
    isAuthReady,
    isGuest,
    updateProfile,
    logout
  }), [user, profile, loading, isAuthReady, isGuest]);

  return (
    <FirebaseContext.Provider value={contextValue}>
      {children}
    </FirebaseContext.Provider>
  );
};
