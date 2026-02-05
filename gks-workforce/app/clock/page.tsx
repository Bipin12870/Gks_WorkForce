'use client';

import { useState, useEffect } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { useNotification } from '@/contexts/NotificationContext';
import { db } from '@/lib/firebase';
import { collection, addDoc, query, where, getDocs, updateDoc, doc, Timestamp } from 'firebase/firestore';
import { TimeRecord } from '@/types';
import { useRouter } from 'next/navigation';

export default function ClockInOutPage() {
    const { userData } = useAuth();
    const router = useRouter();
    const [activeRecord, setActiveRecord] = useState<TimeRecord | null>(null);
    const [loading, setLoading] = useState(true);
    const { showNotification } = useNotification();

    useEffect(() => {
        checkActiveClockIn();
    }, [userData]);

    const checkActiveClockIn = async () => {
        if (!userData) return;

        const q = query(
            collection(db, 'timeRecords'),
            where('staffId', '==', userData.id),
            where('clockOutTime', '==', null)
        );

        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
            const doc = snapshot.docs[0];
            setActiveRecord({ id: doc.id, ...doc.data() } as TimeRecord);
        }
        setLoading(false);
    };

    const handleClockIn = async () => {
        if (!userData) return;

        setLoading(true);

        try {
            const docRef = await addDoc(collection(db, 'timeRecords'), {
                staffId: userData.id,
                clockInTime: Timestamp.now(),
                clockOutTime: null,
                hoursWorked: null,
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
            });

            showNotification('Clocked in successfully!', 'success');
            await checkActiveClockIn();
        } catch (error) {
            console.error('Error clocking in:', error);
            showNotification('Failed to clock in. Please try again.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleClockOut = async () => {
        if (!userData || !activeRecord) return;

        setLoading(true);

        try {
            const clockOutTime = Timestamp.now();
            const clockInTime = activeRecord.clockInTime;

            // Calculate hours worked
            const hoursWorked = (clockOutTime.toMillis() - clockInTime.toMillis()) / (1000 * 60 * 60);

            await updateDoc(doc(db, 'timeRecords', activeRecord.id!), {
                clockOutTime,
                hoursWorked,
                updatedAt: Timestamp.now(),
            });

            showNotification(`Clocked out successfully! Worked ${hoursWorked.toFixed(2)} hours`, 'success');
            setActiveRecord(null);
        } catch (error) {
            console.error('Error clocking out:', error);
            showNotification('Failed to clock out. Please try again.', 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <ProtectedRoute requiredRole="STAFF">
            <div className="min-h-screen bg-background flex items-center justify-center px-4">
                <div className="max-w-md w-full card-base p-8">
                    <div className="text-center mb-8">
                        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Time Clock</h1>
                        <p className="text-sm text-gray-500 mt-1">Hello, {userData?.name}</p>
                    </div>

                    {/* Loading State */}
                    {loading ? (
                        <div className="flex justify-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                        </div>
                    ) : activeRecord ? (
                        // Clocked In State
                        <div className="text-center">
                            <div className="mb-8 p-6 bg-green-50/50 border border-green-100 rounded-xl">
                                <p className="text-xs font-semibold text-green-700 uppercase tracking-wider mb-2">Currently Clocked In</p>
                                <p className="text-4xl font-black text-gray-900 tabular-nums">
                                    {activeRecord.clockInTime.toDate().toLocaleTimeString('en-US', {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        hour12: true,
                                    })}
                                </p>
                                <p className="text-sm text-gray-500 mt-2 font-medium">
                                    {activeRecord.clockInTime.toDate().toLocaleDateString('en-US', {
                                        weekday: 'short',
                                        month: 'short',
                                        day: 'numeric',
                                    })}
                                </p>
                            </div>

                            <button
                                onClick={handleClockOut}
                                className="btn-danger w-full py-4 text-base font-bold"
                            >
                                Clock Out
                            </button>
                        </div>
                    ) : (
                        // Clocked Out State
                        <div className="text-center">
                            <div className="mb-8 p-10 bg-gray-50 border border-gray-100 rounded-xl border-dashed">
                                <p className="text-sm text-gray-400 font-medium italic">You are currently clocked out</p>
                            </div>

                            <button
                                onClick={handleClockIn}
                                className="btn-primary w-full py-4 text-base font-bold"
                            >
                                Clock In
                            </button>
                        </div>
                    )}

                    <button
                        onClick={() => router.push('/dashboard')}
                        className="btn-secondary w-full mt-6 text-sm py-2"
                    >
                        Back to Dashboard
                    </button>
                </div>
            </div>
        </ProtectedRoute>
    );
}
