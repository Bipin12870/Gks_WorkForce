'use client';

import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';

/**
 * BadgeManager handles the PWA "App Badging API" to show a numeric count
 * on the app icon (Home Screen / Dock).
 * 
 * - Admins see the count of PENDING timesheets that need review.
 * - Staff see the count of shifts assigned to them for today.
 */
export default function BadgeManager() {
    const { userData, user } = useAuth();

    useEffect(() => {
        // 1. Check for browser support
        if (typeof window === 'undefined' || !('setAppBadge' in navigator)) {
            return;
        }

        const nav = navigator as typeof navigator & {
            setAppBadge: (count?: number) => Promise<void>;
            clearAppBadge: () => Promise<void>;
        };

        // 2. Clear badge on logout or if no user data
        if (!user || !userData) {
            nav.clearAppBadge().catch(() => {});
            return;
        }

        let unsubscribe = () => {};

        try {
            if (userData.role === 'ADMIN') {
                // ADMIN: Count pending timesheets needing approval
                const q = query(
                    collection(db, 'timesheets'),
                    where('status', '==', 'PENDING')
                );

                unsubscribe = onSnapshot(q, (snapshot) => {
                    const count = snapshot.size;
                    if (count > 0) {
                        nav.setAppBadge(count).catch(() => {});
                    } else {
                        nav.clearAppBadge().catch(() => {});
                    }
                }, (err) => {
                    console.error('BadgeManager Admin Error:', err);
                });
            } else {
                // STAFF: Count shifts assigned for today
                const startOfToday = new Date();
                startOfToday.setHours(0, 0, 0, 0);
                
                const endOfToday = new Date();
                endOfToday.setHours(23, 59, 59, 999);

                const q = query(
                    collection(db, 'shifts'),
                    where('staffId', '==', user.uid),
                    where('date', '>=', Timestamp.fromDate(startOfToday)),
                    where('date', '<=', Timestamp.fromDate(endOfToday))
                );

                unsubscribe = onSnapshot(q, (snapshot) => {
                    const count = snapshot.size;
                    if (count > 0) {
                        nav.setAppBadge(count).catch(() => {});
                    } else {
                        nav.clearAppBadge().catch(() => {});
                    }
                }, (err) => {
                    console.error('BadgeManager Staff Error:', err);
                });
            }
        } catch (err) {
            console.error('BadgeManager Initialization Error:', err);
        }

        return () => unsubscribe();
    }, [user, userData]);

    return null; // This component does not render any UI
}
