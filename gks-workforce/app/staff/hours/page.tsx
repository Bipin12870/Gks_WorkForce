'use client';

import { useState, useEffect } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { TimeRecord } from '@/types';
import { getWeekStart, formatDate } from '@/lib/utils';
import { useRouter } from 'next/navigation';

export default function StaffHoursPage() {
    const { userData } = useAuth();
    const router = useRouter();
    const [selectedWeek, setSelectedWeek] = useState<Date>(getWeekStart(new Date()));
    const [timeRecords, setTimeRecords] = useState<TimeRecord[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadTimeRecords();
    }, [selectedWeek, userData]);

    const loadTimeRecords = async () => {
        if (!userData) return;

        setLoading(true);

        const weekStart = new Date(selectedWeek);
        const weekEnd = new Date(selectedWeek);
        weekEnd.setDate(weekEnd.getDate() + 7);

        const q = query(
            collection(db, 'timeRecords'),
            where('staffId', '==', userData.id),
            where('clockInTime', '>=', Timestamp.fromDate(weekStart)),
            where('clockInTime', '<', Timestamp.fromDate(weekEnd))
        );

        const snapshot = await getDocs(q);
        const records: TimeRecord[] = [];
        snapshot.forEach((doc) => {
            records.push({ id: doc.id, ...doc.data() } as TimeRecord);
        });

        setTimeRecords(records);
        setLoading(false);
    };

    const changeWeek = (direction: 'prev' | 'next') => {
        const newWeek = new Date(selectedWeek);
        newWeek.setDate(newWeek.getDate() + (direction === 'next' ? 7 : -7));
        setSelectedWeek(getWeekStart(newWeek));
    };

    const totalHours = timeRecords.reduce((sum, record) => sum + (record.hoursWorked || 0), 0);
    const grossPay = totalHours * (userData?.hourlyRate || 0);

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
                            <h1 className="text-2xl font-bold text-gray-900">Hours & Pay</h1>
                            <p className="text-sm text-gray-600">View your worked hours and gross pay</p>
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

                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                        <div className="bg-white rounded-xl shadow-sm border p-6">
                            <p className="text-sm text-gray-600 mb-1">Total Hours</p>
                            <p className="text-3xl font-bold text-gray-900">{totalHours.toFixed(2)}</p>
                        </div>
                        <div className="bg-white rounded-xl shadow-sm border p-6">
                            <p className="text-sm text-gray-600 mb-1">Hourly Rate</p>
                            <p className="text-3xl font-bold text-gray-900">${userData?.hourlyRate.toFixed(2)}</p>
                        </div>
                        <div className="bg-white rounded-xl shadow-sm border p-6">
                            <p className="text-sm text-gray-600 mb-1">Gross Pay</p>
                            <p className="text-3xl font-bold text-green-600">${grossPay.toFixed(2)}</p>
                        </div>
                    </div>

                    {/* Loading State */}
                    {loading && (
                        <div className="flex justify-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                        </div>
                    )}

                    {/* Time Records */}
                    {!loading && (
                        <div className="bg-white rounded-xl shadow-sm border">
                            <div className="p-6 border-b">
                                <h3 className="text-lg font-semibold text-gray-900">Time Records</h3>
                            </div>
                            <div className="divide-y">
                                {timeRecords.length === 0 ? (
                                    <p className="p-6 text-gray-500 text-sm">No time records for this week</p>
                                ) : (
                                    timeRecords.map((record) => (
                                        <div key={record.id} className="p-6 flex items-center justify-between">
                                            <div>
                                                <p className="font-medium text-gray-900">
                                                    {formatDate(record.clockInTime.toDate())}
                                                </p>
                                                <p className="text-sm text-gray-600">
                                                    {record.clockInTime.toDate().toLocaleTimeString('en-US', {
                                                        hour: '2-digit',
                                                        minute: '2-digit',
                                                    })}{' '}
                                                    -{' '}
                                                    {record.clockOutTime
                                                        ? record.clockOutTime.toDate().toLocaleTimeString('en-US', {
                                                            hour: '2-digit',
                                                            minute: '2-digit',
                                                        })
                                                        : 'In Progress'}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-semibold text-gray-900">
                                                    {record.hoursWorked ? `${record.hoursWorked.toFixed(2)} hrs` : '-'}
                                                </p>
                                                <p className="text-sm text-gray-600">
                                                    {record.hoursWorked
                                                        ? `$${(record.hoursWorked * (userData?.hourlyRate || 0)).toFixed(2)}`
                                                        : '-'}
                                                </p>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                </main>
            </div>
        </ProtectedRoute>
    );
}
