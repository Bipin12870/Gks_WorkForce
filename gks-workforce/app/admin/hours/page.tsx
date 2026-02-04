'use client';

import { useState, useEffect } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { TimeRecord, User } from '@/types';
import { getWeekStart, formatDate } from '@/lib/utils';
import { useRouter } from 'next/navigation';

export default function AdminHoursPage() {
    const router = useRouter();
    const [selectedWeek, setSelectedWeek] = useState<Date>(getWeekStart(new Date()));
    const [staffHours, setStaffHours] = useState<Record<string, { hours: number; pay: number }>>({});
    const [staffMap, setStaffMap] = useState<Record<string, User>>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, [selectedWeek]);

    const loadData = async () => {
        setLoading(true);

        // Load staff
        const staffSnapshot = await getDocs(collection(db, 'users'));
        const map: Record<string, User> = {};
        staffSnapshot.forEach((doc) => {
            const data = doc.data();
            if (data.role === 'STAFF') {
                map[doc.id] = { id: doc.id, ...data } as User;
            }
        });
        setStaffMap(map);

        // Load time records for the week
        const weekStart = new Date(selectedWeek);
        const weekEnd = new Date(selectedWeek);
        weekEnd.setDate(weekEnd.getDate() + 7);

        const q = query(
            collection(db, 'timeRecords'),
            where('clockInTime', '>=', Timestamp.fromDate(weekStart)),
            where('clockInTime', '<', Timestamp.fromDate(weekEnd))
        );

        const snapshot = await getDocs(q);
        const hours: Record<string, { hours: number; pay: number }> = {};

        snapshot.forEach((doc) => {
            const record = doc.data() as TimeRecord;
            if (!hours[record.staffId]) {
                hours[record.staffId] = { hours: 0, pay: 0 };
            }
            const hoursWorked = record.hoursWorked || 0;
            const hourlyRate = map[record.staffId]?.hourlyRate || 0;
            hours[record.staffId].hours += hoursWorked;
            hours[record.staffId].pay += hoursWorked * hourlyRate;
        });

        setStaffHours(hours);
        setLoading(false);
    };

    const changeWeek = (direction: 'prev' | 'next') => {
        const newWeek = new Date(selectedWeek);
        newWeek.setDate(newWeek.getDate() + (direction === 'next' ? 7 : -7));
        setSelectedWeek(getWeekStart(newWeek));
    };

    const totalHours = Object.values(staffHours).reduce((sum, data) => sum + data.hours, 0);
    const totalPay = Object.values(staffHours).reduce((sum, data) => sum + data.pay, 0);

    return (
        <ProtectedRoute requiredRole="ADMIN">
            <div className="min-h-screen bg-gray-50">
                {/* Header */}
                <header className="bg-white shadow-sm border-b">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                        <div>
                            <button
                                onClick={() => router.push('/dashboard')}
                                className="text-blue-600 hover:text-blue-700 text-sm font-medium mb-2"
                            >
                                ← Back to Dashboard
                            </button>
                            <h1 className="text-2xl font-bold text-gray-900">Hours Summary</h1>
                            <p className="text-sm text-gray-600">View staff hours and pay</p>
                        </div>
                    </div>
                </header>

                {/* Main Content */}
                <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                        <div className="bg-white rounded-xl shadow-sm border p-6">
                            <p className="text-sm text-gray-600 mb-1">Total Hours (All Staff)</p>
                            <p className="text-4xl font-bold text-gray-900">{totalHours.toFixed(2)}</p>
                        </div>
                        <div className="bg-white rounded-xl shadow-sm border p-6">
                            <p className="text-sm text-gray-600 mb-1">Total Gross Pay</p>
                            <p className="text-4xl font-bold text-green-600">${totalPay.toFixed(2)}</p>
                        </div>
                    </div>

                    {/* Loading State */}
                    {loading ? (
                        <div className="flex justify-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                        </div>
                    ) : (
                        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead className="bg-gray-50 border-b">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Staff Name
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Hourly Rate
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Hours Worked
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Gross Pay
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                        {Object.entries(staffMap).map(([staffId, staff]) => {
                                            const hours = staffHours[staffId]?.hours || 0;
                                            const pay = staffHours[staffId]?.pay || 0;
                                            return (
                                                <tr key={staffId}>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className="font-medium text-gray-900">{staff.name}</div>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className="text-sm text-gray-600">${staff.hourlyRate.toFixed(2)}</div>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className="text-sm text-gray-900">{hours.toFixed(2)} hrs</div>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className="text-sm font-semibold text-green-600">
                                                            ${pay.toFixed(2)}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </main>
            </div>
        </ProtectedRoute>
    );
}
