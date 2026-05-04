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
}

const FirebaseContext = createContext<FirebaseContextType>({
  user: null,
  profile: null,
  loading: true,
  isAuthReady: false,
  isGuest: false,
  updateProfile: async () => {},
});

export const useFirebase = () => useContext(FirebaseContext);

const GUEST_PROFILE_KEY = 'arkumen_guest_profile';

const createDefaultProfile = (uid: string, username: string): UserProfile => ({
  uid,
  username,
  points: 0,
  highestScore: 0,
  favoriteCategory: 'General',
  arkerTitle: 'The Neophyte',
  rank: 'Neophyte',
  level: 1,
  createdAt: new Date().toISOString(),
  role: 'user',
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
    if (user) {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, updates);
    } else if (isGuest && profile) {
      const newProfile = { ...profile, ...updates };
      setProfile(newProfile);
      localStorage.setItem(GUEST_PROFILE_KEY, JSON.stringify(newProfile));
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
        // Guest Mode
        const storedGuest = localStorage.getItem(GUEST_PROFILE_KEY);
        if (storedGuest) {
          setProfile(JSON.parse(storedGuest));
        } else {
          const guestProfile = createDefaultProfile('guest_' + Math.random().toString(36).substr(2, 9), 'Guest Arker');
          setProfile(guestProfile);
          localStorage.setItem(GUEST_PROFILE_KEY, JSON.stringify(guestProfile));
        }
        setIsGuest(true);
        setLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  const contextValue = React.useMemo(() => ({
    user,
    profile,
    loading,
    isAuthReady,
    isGuest,
    updateProfile
  }), [user, profile, loading, isAuthReady, isGuest]);

  return (
    <FirebaseContext.Provider value={contextValue}>
      {children}
    </FirebaseContext.Provider>
  );
};
