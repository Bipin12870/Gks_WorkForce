'use client';

import { useState, useEffect } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';
import { Shift } from '@/types';
import { getWeekStart, getDayName, formatDate } from '@/lib/utils';
import { useRouter } from 'next/navigation';

export default function StaffRosterPage() {
    const { userData } = useAuth();
    const router = useRouter();
    const [selectedWeek, setSelectedWeek] = useState<Date>(getWeekStart(new Date()));
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!userData) return;

        // Calculate week range
        const weekStart = new Date(selectedWeek);
        const weekEnd = new Date(selectedWeek);
        weekEnd.setDate(weekEnd.getDate() + 7);

        // Real-time listener for shifts
        const q = query(
            collection(db, 'shifts'),
            where('staffId', '==', userData.id),
            where('date', '>=', Timestamp.fromDate(weekStart)),
            where('date', '<', Timestamp.fromDate(weekEnd))
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const loadedShifts: Shift[] = [];
            snapshot.forEach((doc) => {
                loadedShifts.push({ id: doc.id, ...doc.data() } as Shift);
            });
            setShifts(loadedShifts);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [selectedWeek, userData]);

    const changeWeek = (direction: 'prev' | 'next') => {
        const newWeek = new Date(selectedWeek);
        newWeek.setDate(newWeek.getDate() + (direction === 'next' ? 7 : -7));
        setSelectedWeek(getWeekStart(newWeek));
    };

    const getShiftsForDay = (dayOfWeek: number) => {
        return shifts.filter((shift) => {
            const shiftDate = shift.date.toDate();
            return shiftDate.getDay() === dayOfWeek;
        });
    };

    return (
        <ProtectedRoute requiredRole="STAFF">
            <div className="min-h-screen bg-gray-50">
                {/* Header */}
                <header className="bg-white shadow-sm border-b">
                    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                        <div>
                            <button
                                onClick={() => router.push('/dashboard')}
                                className="text-blue-600 hover:text-blue-700 text-sm font-medium mb-2"
                            >
                                ← Back to Dashboard
                            </button>
                            <h1 className="text-2xl font-bold text-gray-900">My Roster</h1>
                            <p className="text-sm text-gray-600">View your approved shifts</p>
                        </div>
                    </div>
                </header>

                {/* Main Content */}
                <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    {/* Week Selector */}
                    <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
                        <div className="flex items-center justify-between">
                            <button
                                onClick={() => changeWeek('prev')}
                                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition"
                            >
                                ← Previous Week
                            </button>
                            <h2 className="text-lg font-semibold text-gray-900">
                                Week of {formatDate(selectedWeek)}
                            </h2>
                            <button
                                onClick={() => changeWeek('next')}
                                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition"
                            >
                                Next Week →
                            </button>
                        </div>
                    </div>

                    {/* Loading State */}
                    {loading && (
                        <div className="flex justify-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                        </div>
                    )}

                    {/* Shifts by Day */}
                    {!loading && (
                        <div className="space-y-4">
                            {[1, 2, 3, 4, 5, 6, 0].map((dayOfWeek) => {
                                const dayShifts = getShiftsForDay(dayOfWeek);
                                return (
                                    <div key={dayOfWeek} className="bg-white rounded-xl shadow-sm border p-6">
                                        <h3 className="text-lg font-semibold text-gray-900 mb-4">
                                            {getDayName(dayOfWeek)}
                                        </h3>

                                        {dayShifts.length === 0 ? (
                                            <p className="text-gray-500 text-sm">No shifts scheduled</p>
                                        ) : (
                                            <div className="space-y-3">
                                                {dayShifts.map((shift) => (
                                                    <div
                                                        key={shift.id}
                                                        className="flex items-center justify-between p-4 bg-blue-50 border border-blue-200 rounded-lg"
                                                    >
                                                        <div>
                                                            <p className="font-medium text-gray-900">
                                                                {shift.startTime} - {shift.endTime}
                                                            </p>
                                                            <p className="text-sm text-gray-600">
                                                                {formatDate(shift.date.toDate())}
                                                            </p>
                                                        </div>
                                                        <div className="px-3 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                                                            Approved
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </main>
            </div>
        </ProtectedRoute>
    );
}
