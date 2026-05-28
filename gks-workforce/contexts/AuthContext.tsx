'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { User as FirebaseUser, onAuthStateChanged, signInWithEmailAndPassword, signOut, getIdToken } from 'firebase/auth';
import { doc, getDoc, collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { User, TimeRecord, Shift, ShopLocation } from '@/types';

interface AuthContextType {
    user: FirebaseUser | null;
    userData: User | null;
    loading: boolean;
    activeRecord: TimeRecord | null;
    todayShift: Shift | null;
    shopLocation: ShopLocation | null;
    login: (email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    userData: null,
    loading: true,
    activeRecord: null,
    todayShift: null,
    shopLocation: null,
    login: async () => { },
    logout: async () => { },
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<FirebaseUser | null>(null);
    const [userData, setUserData] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeRecord, setActiveRecord] = useState<TimeRecord | null>(null);
    const [todayShift, setTodayShift] = useState<Shift | null>(null);
    const [shopLocation, setShopLocation] = useState<ShopLocation | null>(null);

    useEffect(() => {
        let loadingTimedOut = false;
        let unsubscribeActive: (() => void) | null = null;
        let unsubscribeShifts: (() => void) | null = null;

        const safetyTimer = setTimeout(() => {
            loadingTimedOut = true;
            setLoading((curr) => {
                if (curr) {
                    console.warn('Auth loading timed out. Setting loading to false as safety fallback.');
                    return false;
                }
                return curr;
            });
        }, 6000);

        const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
            setUser(firebaseUser);

            // Clean up previous listeners if any
            if (unsubscribeActive) {
                unsubscribeActive();
                unsubscribeActive = null;
            }
            if (unsubscribeShifts) {
                unsubscribeShifts();
                unsubscribeShifts = null;
            }

            if (firebaseUser) {
                try {
                    // Fetch user data from Firestore
                    const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
                    if (userDoc.exists()) {
                        setUserData({ id: userDoc.id, ...userDoc.data() } as User);
                    }
                } catch (err) {
                    console.error('Error fetching user document:', err);
                }

                // Fetch shop location once in the background
                const shopRef = doc(db, 'config', 'shopLocation');
                getDoc(shopRef).then((snap) => {
                    if (snap.exists()) {
                        setShopLocation(snap.data() as ShopLocation);
                    }
                }).catch((err) => {
                    console.error('Error fetching shop location:', err);
                });

                // Listen to active clock-in record in real-time
                const activeQ = query(
                    collection(db, 'timeRecords'),
                    where('staffId', '==', firebaseUser.uid),
                    where('clockOutTime', '==', null)
                );
                unsubscribeActive = onSnapshot(activeQ, (snapshot) => {
                    if (!snapshot.empty) {
                        const docSnap = snapshot.docs[0];
                        setActiveRecord({ id: docSnap.id, ...docSnap.data() } as TimeRecord);
                    } else {
                        setActiveRecord(null);
                    }
                }, (error) => {
                    console.error('Error listening to active record:', error);
                });

                // Listen to today's approved shift in real-time
                const startOfToday = new Date();
                startOfToday.setHours(0, 0, 0, 0);
                const dateTimestamp = Timestamp.fromDate(startOfToday);

                const shiftsQ = query(
                    collection(db, 'shifts'),
                    where('staffId', '==', firebaseUser.uid),
                    where('date', '==', dateTimestamp),
                    where('status', '==', 'APPROVED')
                );
                unsubscribeShifts = onSnapshot(shiftsQ, (snapshot) => {
                    if (!snapshot.empty) {
                        const docSnap = snapshot.docs[0];
                        setTodayShift({ id: docSnap.id, ...docSnap.data() } as Shift);
                    } else {
                        setTodayShift(null);
                    }
                }, (error) => {
                    console.error('Error listening to today shift:', error);
                });

                // Set session cookie for server-side auth
                try {
                    const idToken = await getIdToken(firebaseUser);
                    await fetch('/api/auth/session', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ idToken }),
                    });
                } catch (error) {
                    console.error('Failed to set session cookie:', error);
                }
            } else {
                setUserData(null);
                setActiveRecord(null);
                setTodayShift(null);
                // Clear session cookie on logout
                try {
                    await fetch('/api/auth/session', { method: 'DELETE' });
                } catch (error) {
                    console.error('Failed to clear session cookie:', error);
                }
            }

            if (!loadingTimedOut) {
                clearTimeout(safetyTimer);
                setLoading(false);
            }
        });

        return () => {
            clearTimeout(safetyTimer);
            unsubscribeAuth();
            if (unsubscribeActive) unsubscribeActive();
            if (unsubscribeShifts) unsubscribeShifts();
        };
    }, []);

    const login = async (email: string, password: string) => {
        await signInWithEmailAndPassword(auth, email, password);
    };

    const logout = async () => {
        await signOut(auth);
    };

    return (
        <AuthContext.Provider value={{ user, userData, loading, activeRecord, todayShift, shopLocation, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
}
