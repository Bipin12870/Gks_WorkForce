'use client';

import { useState, useEffect } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { Shift, User, Timesheet } from '@/types';
import { getWeekStart, formatDate, calculateHours } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { useNotification } from '@/contexts/NotificationContext';
import Logo from '@/components/Logo';

export default function AdminHoursPage() {
    const { userData } = useAuth();
    const router = useRouter();
    const [selectedWeek, setSelectedWeek] = useState<Date>(getWeekStart(new Date()));
    const [staffHours, setStaffHours] = useState<Record<string, { hours: number; pay: number }>>({});
    const [staffMap, setStaffMap] = useState<Record<string, User>>({});
    const [loading, setLoading] = useState(true);
    const { showNotification } = useNotification();

    useEffect(() => {
        if (userData?.role === 'ADMIN') {
            loadData();
        }
    }, [selectedWeek, userData]);

    const loadData = async () => {
        if (!userData || userData.role !== 'ADMIN') return;
        setLoading(true);

        try {
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

            // Week range
            const weekStart = new Date(selectedWeek);
            const weekEnd = new Date(selectedWeek);
            weekEnd.setDate(weekEnd.getDate() + 7);

            // Load all approved shifts for the week
            const shiftsQ = query(
                collection(db, 'shifts'),
                where('date', '>=', Timestamp.fromDate(weekStart)),
                where('date', '<', Timestamp.fromDate(weekEnd)),
                where('status', '==', 'APPROVED')
            );
            const shiftsSnapshot = await getDocs(shiftsQ);
            const loadedShifts: Shift[] = [];
            shiftsSnapshot.forEach((doc) => {
                loadedShifts.push({ id: doc.id, ...doc.data() } as Shift);
            });

            // Load all approved timesheets for the week
            const timesheetsQ = query(
                collection(db, 'timesheets'),
                where('weekStartDate', '==', Timestamp.fromDate(weekStart)),
                where('status', '==', 'APPROVED')
            );
            const timesheetsSnapshot = await getDocs(timesheetsQ);
            const loadedTimesheets: Timesheet[] = [];
            timesheetsSnapshot.forEach((doc) => {
                loadedTimesheets.push({ id: doc.id, ...doc.data() } as Timesheet);
            });

            const hours: Record<string, { hours: number; pay: number }> = {};

            // Calculate hours per staff member strictly using approved timesheets
            loadedTimesheets.forEach((ts) => {
                if (!hours[ts.staffId]) {
                    hours[ts.staffId] = { hours: 0, pay: 0 };
                }

                const duration = calculateHours(ts.workedStart, ts.workedEnd);
                const hourlyRate = map[ts.staffId]?.hourlyRate || 0;

                hours[ts.staffId].hours += duration;
                hours[ts.staffId].pay += duration * hourlyRate;
            });

            setStaffHours(hours);
        } catch (error: any) {
            console.error('Error loading data:', error);
            if (error?.code === 'permission-denied') {
                showNotification('Permission denied. Please ensure you are logged in as an admin.', 'error');
            } else {
                showNotification('Failed to load hours data. Please try again.', 'error');
            }
        } finally {
            setLoading(false);
        }
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
            <div className="min-h-screen bg-background text-gray-900">
                {/* Header */}
                <header className="bg-white border-b border-gray-200">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                        <div className="flex items-center gap-6">
                            <Logo width={100} height={35} />
                            <div className="border-l border-gray-200 pl-6">
                                <button
                                    onClick={() => router.push('/dashboard')}
                                    className="text-blue-600 hover:text-blue-700 text-xs font-bold uppercase tracking-wider mb-0.5 block transition-colors"
                                >
                                    ← Dashboard
                                </button>
                                <h1 className="text-xl font-bold text-gray-900 tracking-tight">Hours & Payroll Summary</h1>
                            </div>
                        </div>
                    </div>
                </header>

                {/* Main Content */}
                <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    {/* Week Selector */}
                    <div className="card-base p-6 mb-8 flex flex-col md:flex-row items-center justify-between gap-6">
                        <div className="flex items-center bg-gray-50 p-1 rounded-xl border border-gray-100">
                            <button
                                onClick={() => changeWeek('prev')}
                                className="p-2 text-gray-500 hover:text-gray-900 hover:bg-white hover:shadow-sm rounded-lg transition-all"
                                title="Previous Week"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                            </button>
                            <div className="px-6 py-1.5 text-sm font-bold text-gray-900 whitespace-nowrap min-w-[200px] text-center">
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
                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 self-center">Status Filter:</span>
                            <span className="px-3 py-1 bg-green-50 text-green-700 text-[10px] font-black uppercase tracking-widest rounded border border-green-100 flex items-center">
                                Approved Timesheets Only
                            </span>
                        </div>
                    </div>

                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
                        <div className="card-base p-8 border-l-4 border-l-blue-600">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Operating Hours (Total)</p>
                            <div className="flex items-baseline gap-2">
                                <p className="text-5xl font-black text-gray-900 tracking-tighter tabular-nums">{totalHours.toFixed(2)}</p>
                                <p className="text-lg font-bold text-gray-400">hrs</p>
                            </div>
                        </div>
                        <div className="card-base p-8 border-l-4 border-l-green-600">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Gross Labor Cost</p>
                            <div className="flex items-baseline gap-1">
                                <p className="text-lg font-bold text-green-600/50">$</p>
                                <p className="text-5xl font-black text-green-600 tracking-tighter tabular-nums">{totalPay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                            </div>
                        </div>
                    </div>

                    {/* Table Section */}
                    {loading ? (
                        <div className="flex justify-center py-20">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                        </div>
                    ) : (
                        <div className="card-base">
                            <div className="px-6 py-4 border-b border-gray-100">
                                <h3 className="font-bold text-gray-900">Detailed Payroll Report</h3>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="bg-gray-50/50">
                                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                                                Staff Member
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                                                Rate
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                                                Total Hours
                                            </th>
                                            <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                                                Estimated Pay
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {Object.entries(staffMap).map(([staffId, staff]) => {
                                            const hours = staffHours[staffId]?.hours || 0;
                                            const pay = staffHours[staffId]?.pay || 0;
                                            return (
                                                <tr key={staffId} className="hover:bg-gray-50/80 transition-colors">
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className="font-semibold text-gray-900">{staff.name}</div>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className="text-sm text-gray-500 font-medium tabular-nums">${staff.hourlyRate.toFixed(2)}/hr</div>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className="text-sm font-bold text-gray-900 tabular-nums">{hours.toFixed(2)} hrs</div>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-right">
                                                        <div className="text-sm font-black text-green-600 tabular-nums">
                                                            ${pay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {Object.keys(staffMap).length === 0 && (
                                            <tr>
                                                <td colSpan={4} className="px-6 py-10 text-center text-sm text-gray-400 font-medium italic">
                                                    No active staff members found
                                                </td>
                                            </tr>
                                        )}
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
