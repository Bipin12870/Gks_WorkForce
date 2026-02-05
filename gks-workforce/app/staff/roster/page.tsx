'use client';

import { useState, useEffect } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';
import { Shift } from '@/types';
import { getWeekStart, getDayName, formatDate, calculateHours } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import Logo from '@/components/Logo';

export default function StaffRosterPage() {
    const { userData } = useAuth();
    const router = useRouter();
    const [selectedWeek, setSelectedWeek] = useState<Date>(getWeekStart(new Date()));
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!userData || userData.role !== 'STAFF') return;

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
            <div className="min-h-screen bg-background text-gray-900">
                {/* Header */}
                <header className="bg-white border-b border-gray-200">
                    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                        <div className="flex items-center gap-6">
                            <Logo width={100} height={35} />
                            <div className="border-l border-gray-200 pl-6">
                                <button
                                    onClick={() => router.push('/dashboard')}
                                    className="text-blue-600 hover:text-blue-700 text-xs font-bold uppercase tracking-wider mb-0.5 block transition-colors"
                                >
                                    ← Dashboard
                                </button>
                                <h1 className="text-xl font-bold text-gray-900 tracking-tight">My Weekly Roster</h1>
                            </div>
                        </div>
                    </div>
                </header>

                {/* Main Content */}
                <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    {/* Week Selector */}
                    <div className="card-base p-6 mb-8 flex flex-col md:flex-row items-center justify-between gap-6">
                        <div className="flex items-center bg-gray-50 p-1 rounded-xl border border-gray-100 w-full md:w-auto">
                            <button
                                onClick={() => changeWeek('prev')}
                                className="p-2 text-gray-500 hover:text-gray-900 hover:bg-white hover:shadow-sm rounded-lg transition-all"
                                title="Previous Week"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                            </button>
                            <div className="px-6 py-1.5 text-sm font-bold text-gray-900 whitespace-nowrap flex-grow text-center min-w-[180px]">
                                Week of {formatDate(selectedWeek)}
                            </div>
                            <button
                                onClick={() => changeWeek('next')}
                                className="p-2 text-gray-500 hover:text-gray-900 hover:bg-white hover:shadow-sm rounded-lg transition-all"
                                title="Next Week"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                                </svg>
                            </button>
                        </div>

                        <div className="flex gap-4">
                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 self-center">Status:</span>
                            <span className="px-3 py-1 bg-blue-50 text-blue-700 text-[10px] font-black uppercase tracking-widest rounded border border-blue-100 flex items-center">
                                Roster Live
                            </span>
                        </div>
                    </div>

                    {/* Summary Cards */}
                    {!loading && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
                            <div className="card-base p-8 border-l-4 border-l-blue-600">
                                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Total Scheduled</p>
                                <div className="flex items-baseline gap-2">
                                    <p className="text-5xl font-black text-gray-900 tracking-tighter tabular-nums">
                                        {shifts.reduce((sum, s) => sum + calculateHours(s.startTime, s.endTime), 0).toFixed(2)}
                                    </p>
                                    <p className="text-lg font-bold text-gray-400">hrs</p>
                                </div>
                            </div>
                            <div className="card-base p-8 border-l-4 border-l-green-600">
                                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Projected Pay</p>
                                <div className="flex items-baseline gap-1">
                                    <p className="text-lg font-bold text-green-600/50">$</p>
                                    <p className="text-5xl font-black text-green-600 tracking-tighter tabular-nums">
                                        {(shifts.reduce((sum, s) => sum + calculateHours(s.startTime, s.endTime), 0) * (userData?.hourlyRate || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Loading State */}
                    {loading && (
                        <div className="flex justify-center py-20">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                        </div>
                    )}

                    {/* Shifts by Day */}
                    {!loading && (
                        <div className="space-y-6">
                            {[1, 2, 3, 4, 5, 6, 0].map((dayOfWeek) => {
                                const dayShifts = getShiftsForDay(dayOfWeek);
                                return (
                                    <div key={dayOfWeek} className="card-base p-6 hover:border-gray-200 transition-colors group">
                                        <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest flex items-center gap-2 mb-6">
                                            <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                                            {getDayName(dayOfWeek)}
                                        </h3>

                                        {dayShifts.length === 0 ? (
                                            <div className="py-4 text-center border-2 border-dashed border-gray-100 rounded-xl">
                                                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">No shifts scheduled</p>
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                {dayShifts.map((shift) => (
                                                    <div
                                                        key={shift.id}
                                                        className="flex items-center justify-between p-5 bg-gray-50/50 rounded-xl border border-gray-100 group-hover:bg-white group-hover:shadow-sm transition-all"
                                                    >
                                                        <div className="flex items-center gap-6">
                                                            <div className="bg-white p-3 rounded-lg border border-gray-100 shadow-sm">
                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600" viewBox="0 0 20 20" fill="currentColor">
                                                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                                                                </svg>
                                                            </div>
                                                            <div>
                                                                <p className="text-lg font-black text-gray-900 tracking-tight">
                                                                    {shift.startTime} - {shift.endTime}
                                                                </p>
                                                                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                                                                    {formatDate(shift.date.toDate())}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <div className="px-4 py-1.5 bg-green-50 text-green-700 text-[10px] font-black uppercase tracking-[0.1em] rounded-lg border border-green-100">
                                                            Confirmed
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
