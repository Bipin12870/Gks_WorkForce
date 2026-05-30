'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { User as FirebaseUser, onAuthStateChanged, signInWithEmailAndPassword, signOut, getIdToken } from 'firebase/auth';
import { auth } from '@/lib/firebase';
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

        const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
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
                const uid = firebaseUser.uid;
                const cachedUserKey = `gks_user_data_${uid}`;

                // 1. Try to load from localStorage first for instant load
                let hasCache = false;
                if (typeof window !== 'undefined') {
                    const cachedUser = localStorage.getItem(cachedUserKey);
                    const cachedShop = localStorage.getItem('gks_shop_location');

                    if (cachedUser) {
                        try {
                            setUserData(JSON.parse(cachedUser));
                            hasCache = true;
                        } catch (e) {
                            console.error('Failed to parse cached user data', e);
                        }
                    }
                    if (cachedShop) {
                        try {
                            setShopLocation(JSON.parse(cachedShop));
                        } catch (e) {
                            console.error('Failed to parse cached shop location', e);
                        }
                    }
                }

                // If cache exists, set loading to false immediately to reveal the app shell
                if (hasCache && !loadingTimedOut) {
                    clearTimeout(safetyTimer);
                    setLoading(false);
                }

                // 2. Fetch fresh data from Firestore in the background
                (async () => {
                    try {
                        const { doc, getDoc, collection, query, where, onSnapshot, Timestamp } = await import('firebase/firestore');
                        const { db } = await import('@/lib/firebase-db');

                        // Fetch user data from Firestore
                        const userDoc = await getDoc(doc(db, 'users', uid));
                        if (userDoc.exists()) {
                            const freshUser = { id: userDoc.id, ...userDoc.data() } as User;
                            setUserData(freshUser);
                            if (typeof window !== 'undefined') {
                                localStorage.setItem(cachedUserKey, JSON.stringify(freshUser));
                            }
                        }

                        // Fetch shop location
                        const shopRef = doc(db, 'config', 'shopLocation');
                        const shopSnap = await getDoc(shopRef);
                        if (shopSnap.exists()) {
                            const freshShop = shopSnap.data() as ShopLocation;
                            setShopLocation(freshShop);
                            if (typeof window !== 'undefined') {
                                localStorage.setItem('gks_shop_location', JSON.stringify(freshShop));
                            }
                        }

                        // If we didn't have cache, set loading to false now that basic user data is here
                        if (!hasCache && !loadingTimedOut) {
                            clearTimeout(safetyTimer);
                            setLoading(false);
                        }

                        // Listen to active clock-in record in real-time
                        const activeQ = query(
                            collection(db, 'timeRecords'),
                            where('staffId', '==', uid),
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
                            where('staffId', '==', uid),
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

                    } catch (err) {
                        console.error('Background Firestore operations failed:', err);
                        // Make sure we resolve loading state even on failure if not resolved yet
                        if (!hasCache && !loadingTimedOut) {
                            clearTimeout(safetyTimer);
                            setLoading(false);
                        }
                    }
                })();

                // Set session cookie for server-side auth (non-blocking background task)
                getIdToken(firebaseUser).then((idToken) => {
                    fetch('/api/auth/session', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ idToken }),
                    }).catch((error) => {
                        console.error('Failed to set session cookie:', error);
                    });
                }).catch((error) => {
                    console.error('Failed to get ID token:', error);
                });
            } else {
                setUserData(null);
                setActiveRecord(null);
                setTodayShift(null);
                setShopLocation(null);

                // Clear session cookie on logout (non-blocking background task)
                fetch('/api/auth/session', { method: 'DELETE' }).catch((error) => {
                    console.error('Failed to clear session cookie:', error);
                });

                // Clear cached user info
                if (typeof window !== 'undefined') {
                    for (let i = localStorage.length - 1; i >= 0; i--) {
                        const key = localStorage.key(i);
                        if (key && (key.startsWith('gks_user_data_') || key === 'gks_shop_location')) {
                            localStorage.removeItem(key);
                        }
                    }
                }

                if (!loadingTimedOut) {
                    clearTimeout(safetyTimer);
                    setLoading(false);
                }
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
