'use client';

import { useState, useEffect } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { Shift, Timesheet } from '@/types';
import { getWeekStart, formatDate, calculateHours } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import Logo from '@/components/Logo';

export default function StaffHoursPage() {
    const { userData } = useAuth();
    const router = useRouter();
    const [selectedWeek, setSelectedWeek] = useState<Date>(getWeekStart(new Date()));
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, [selectedWeek, userData]);

    const loadData = async () => {
        if (!userData) return;

        setLoading(true);

        const weekStart = new Date(selectedWeek);
        const weekEnd = new Date(selectedWeek);
        weekEnd.setDate(weekEnd.getDate() + 7);

        try {
            // Load shifts
            const shiftsQ = query(
                collection(db, 'shifts'),
                where('staffId', '==', userData.id),
                where('date', '>=', Timestamp.fromDate(weekStart)),
                where('date', '<', Timestamp.fromDate(weekEnd)),
                where('status', '==', 'APPROVED')
            );
            const shiftsSnapshot = await getDocs(shiftsQ);
            const loadedShifts: Shift[] = [];
            shiftsSnapshot.forEach((doc) => {
                loadedShifts.push({ id: doc.id, ...doc.data() } as Shift);
            });
            loadedShifts.sort((a, b) => {
                const dateDiff = a.date.toMillis() - b.date.toMillis();
                if (dateDiff !== 0) return dateDiff;
                return a.startTime.localeCompare(b.startTime);
            });
            setShifts(loadedShifts);

            // Load timesheets
            const timesheetsQ = query(
                collection(db, 'timesheets'),
                where('staffId', '==', userData.id),
                where('weekStartDate', '==', Timestamp.fromDate(weekStart))
            );
            const timesheetsSnapshot = await getDocs(timesheetsQ);
            const loadedTimesheets: Timesheet[] = [];
            timesheetsSnapshot.forEach((doc) => {
                loadedTimesheets.push({ id: doc.id, ...doc.data() } as Timesheet);
            });
            setTimesheets(loadedTimesheets);
        } catch (error) {
            console.error('Error loading hours data:', error);
        } finally {
            setLoading(false);
        }
    };

    const changeWeek = (direction: 'prev' | 'next') => {
        const newWeek = new Date(selectedWeek);
        newWeek.setDate(newWeek.getDate() + (direction === 'next' ? 7 : -7));
        setSelectedWeek(getWeekStart(newWeek));
    };

    // Calculate hours and pay strictly based on approved timesheets
    let totalHours = 0;
    timesheets.filter(ts => ts.status === 'APPROVED').forEach((ts) => {
        totalHours += calculateHours(ts.workedStart, ts.workedEnd);
    });

    const grossPay = totalHours * (userData?.hourlyRate || 0);

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
                                <h1 className="text-xl font-bold text-gray-900 tracking-tight">Hours & Pay Summary</h1>
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
                            <span className="px-3 py-1 bg-green-50 text-green-700 text-[10px] font-black uppercase tracking-widest rounded border border-green-100 flex items-center">
                                Verified Approved
                            </span>
                        </div>
                    </div>

                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                        <div className="card-base p-6 border-l-4 border-l-blue-600">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Weekly Hours</p>
                            <div className="flex items-baseline gap-1">
                                <p className="text-3xl font-black text-gray-900 tracking-tighter tabular-nums">{totalHours.toFixed(2)}</p>
                                <p className="text-sm font-bold text-gray-400">hrs</p>
                            </div>
                        </div>
                        <div className="card-base p-6 border-l-4 border-l-gray-400">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Hourly Rate</p>
                            <div className="flex items-baseline gap-1">
                                <p className="text-sm font-bold text-gray-400">$</p>
                                <p className="text-3xl font-black text-gray-900 tracking-tighter tabular-nums">{userData?.hourlyRate.toFixed(2)}</p>
                            </div>
                        </div>
                        <div className="card-base p-6 border-l-4 border-l-green-600">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Estimated Gross</p>
                            <div className="flex items-baseline gap-1">
                                <p className="text-sm font-bold text-green-600/50">$</p>
                                <p className="text-3xl font-black text-green-600 tracking-tighter tabular-nums">{grossPay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                            </div>
                        </div>
                    </div>

                    {/* Loading State */}
                    {loading && (
                        <div className="flex justify-center py-20">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                        </div>
                    )}

                    {/* Shift Records */}
                    {!loading && (
                        <div className="card-base overflow-hidden">
                            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                                <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">Approved Shift Log</h3>
                            </div>
                            <div className="divide-y divide-gray-100">
                                {shifts.length === 0 ? (
                                    <div className="p-10 text-center">
                                        <p className="text-sm font-bold text-gray-400 uppercase tracking-widest italic">No approved shifts found for this period</p>
                                    </div>
                                ) : (
                                    shifts.map((shift) => {
                                        const ts = timesheets.find((t) => t.shiftId === shift.id);
                                        const isApproved = ts?.status === 'APPROVED';
                                        const hours = isApproved ? calculateHours(ts.workedStart, ts.workedEnd) : 0;
                                        const rosteredHours = calculateHours(shift.startTime, shift.endTime);

                                        return (
                                            <div key={shift.id} className="p-6 flex items-center justify-between hover:bg-gray-50/50 transition-colors group">
                                                <div className="flex items-center gap-4">
                                                    <div className="bg-white p-2 rounded-lg border border-gray-100 shadow-sm group-hover:border-blue-100 transition-colors">
                                                        <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${isApproved ? 'text-green-500' : 'text-gray-400'} group-hover:text-blue-500 transition-colors`} viewBox="0 0 20 20" fill="currentColor">
                                                            <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                                                        </svg>
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-gray-900 tracking-tight">
                                                            {formatDate(shift.date.toDate())}
                                                        </p>
                                                        <div className="flex items-center gap-2">
                                                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                                                                {isApproved ? `${ts.workedStart} - ${ts.workedEnd}` : `${shift.startTime} - ${shift.endTime} (Rostered)`}
                                                            </p>
                                                            {ts && (
                                                                <span className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-wider rounded border whitespace-nowrap ${ts.status === 'APPROVED' ? 'bg-green-50 text-green-700 border-green-100' :
                                                                        ts.status === 'REJECTED' ? 'bg-red-50 text-red-700 border-red-100' :
                                                                            'bg-blue-50 text-blue-700 border-blue-100'
                                                                    }`}>
                                                                    {ts.status}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    {isApproved ? (
                                                        <>
                                                            <p className="text-sm font-black text-gray-900 tabular-nums">
                                                                {hours.toFixed(2)} hrs
                                                            </p>
                                                            <p className="text-xs font-bold text-green-600 uppercase tracking-widest tabular-nums">
                                                                ${(hours * (userData?.hourlyRate || 0)).toFixed(2)}
                                                            </p>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <p className="text-sm font-bold text-gray-300 tabular-nums line-through">
                                                                {rosteredHours.toFixed(2)} hrs
                                                            </p>
                                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                                                {ts ? 'Pending Approval' : 'No Timesheet'}
                                                            </p>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    )}
                </main>
            </div>
        </ProtectedRoute>
    );
}
