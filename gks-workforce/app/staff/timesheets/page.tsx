'use client';

import { useState, useEffect } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, Timestamp, addDoc, serverTimestamp } from 'firebase/firestore';
import { Shift, Timesheet, TimesheetStatus } from '@/types';
import { getWeekStart, getDayName, formatDate } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { useNotification } from '@/contexts/NotificationContext';
import Logo from '@/components/Logo';

export default function StaffTimesheetsPage() {
    const { userData } = useAuth();
    const router = useRouter();
    const { showNotification } = useNotification();
    const [selectedWeek, setSelectedWeek] = useState<Date>(getWeekStart(new Date()));
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState<string | null>(null);

    // Form state for editing worked times before submission
    const [editMode, setEditMode] = useState<string | null>(null);
    const [workedStart, setWorkedStart] = useState('');
    const [workedEnd, setWorkedEnd] = useState('');

    useEffect(() => {
        if (!userData || userData.role !== 'STAFF') return;

        const weekStart = new Date(selectedWeek);
        const weekEnd = new Date(selectedWeek);
        weekEnd.setDate(weekEnd.getDate() + 7);

        // Listen for approved shifts
        const shiftsQuery = query(
            collection(db, 'shifts'),
            where('staffId', '==', userData.id),
            where('status', '==', 'APPROVED'),
            where('date', '>=', Timestamp.fromDate(weekStart)),
            where('date', '<', Timestamp.fromDate(weekEnd))
        );

        const unsubscribeShifts = onSnapshot(shiftsQuery,
            (snapshot) => {
                const loadedShifts: Shift[] = [];
                snapshot.forEach((doc) => {
                    loadedShifts.push({ id: doc.id, ...doc.data() } as Shift);
                });
                // Sort by date and startTime
                loadedShifts.sort((a, b) => {
                    const dateDiff = a.date.toMillis() - b.date.toMillis();
                    if (dateDiff !== 0) return dateDiff;
                    return a.startTime.localeCompare(b.startTime);
                });
                setShifts(loadedShifts);
            },
            (error) => {
                console.error('Error fetching shifts:', error);
                showNotification('Failed to load rostered shifts.', 'error');
            }
        );

        // Listen for timesheets
        const timesheetsQuery = query(
            collection(db, 'timesheets'),
            where('staffId', '==', userData.id),
            where('weekStartDate', '==', Timestamp.fromDate(weekStart))
        );

        const unsubscribeTimesheets = onSnapshot(timesheetsQuery,
            (snapshot) => {
                const loadedTimesheets: Timesheet[] = [];
                snapshot.forEach((doc) => {
                    loadedTimesheets.push({ id: doc.id, ...doc.data() } as Timesheet);
                });
                setTimesheets(loadedTimesheets);
                setLoading(false);
            },
            (error) => {
                console.error('Error fetching timesheets:', error);
                showNotification('Failed to load timesheets.', 'error');
                setLoading(false);
            }
        );

        return () => {
            unsubscribeShifts();
            unsubscribeTimesheets();
        };
    }, [selectedWeek, userData]);

    const changeWeek = (direction: 'prev' | 'next') => {
        const newWeek = new Date(selectedWeek);
        newWeek.setDate(newWeek.getDate() + (direction === 'next' ? 7 : -7));
        setSelectedWeek(getWeekStart(newWeek));
    };

    const getTimesheetForShift = (shiftId: string) => {
        return timesheets.find(ts => ts.shiftId === shiftId);
    };

    const handleStartEdit = (shift: Shift) => {
        const existingTs = getTimesheetForShift(shift.id!);
        if (existingTs) return; // Cannot edit if already exists

        setEditMode(shift.id!);
        setWorkedStart(shift.startTime);
        setWorkedEnd(shift.endTime);
    };

    const handleSubmitTimesheet = async (shift: Shift) => {
        if (!userData) return;

        setSubmitting(shift.id!);
        try {
            const timesheetData: Omit<Timesheet, 'id'> = {
                staffId: userData.id,
                shiftId: shift.id!,
                date: shift.date,
                weekStartDate: Timestamp.fromDate(getWeekStart(shift.date.toDate())),
                approvedShiftStart: shift.startTime,
                approvedShiftEnd: shift.endTime,
                workedStart: workedStart,
                workedEnd: workedEnd,
                status: 'PENDING',
                createdAt: serverTimestamp() as Timestamp,
                updatedAt: serverTimestamp() as Timestamp
            };

            await addDoc(collection(db, 'timesheets'), timesheetData);
            showNotification('Timesheet submitted successfully', 'success');
            setEditMode(null);
        } catch (error) {
            console.error('Error submitting timesheet:', error);
            showNotification('Failed to submit timesheet', 'error');
        } finally {
            setSubmitting(null);
        }
    };

    const getStatusBadge = (status: TimesheetStatus) => {
        switch (status) {
            case 'PENDING':
                return <span className="px-2 py-1 bg-yellow-50 text-yellow-700 text-[10px] font-black uppercase tracking-wider rounded border border-yellow-100 italic">Pending</span>;
            case 'APPROVED':
                return <span className="px-2 py-1 bg-green-50 text-green-700 text-[10px] font-black uppercase tracking-wider rounded border border-green-100">Approved</span>;
            case 'REJECTED':
                return <span className="px-2 py-1 bg-red-50 text-red-700 text-[10px] font-black uppercase tracking-wider rounded border border-red-100">Rejected</span>;
            default:
                return null;
        }
    };

    return (
        <ProtectedRoute requiredRole="STAFF">
            <div className="min-h-screen bg-background text-gray-900">
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
                                <h1 className="text-xl font-bold text-gray-900 tracking-tight">Shift Timesheets</h1>
                            </div>
                        </div>
                    </div>
                </header>

                <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    <div className="card-base p-6 mb-8 flex flex-col md:flex-row items-center justify-between gap-6">
                        <div className="flex items-center bg-gray-50 p-1 rounded-xl border border-gray-100 w-full md:w-auto">
                            <button
                                onClick={() => changeWeek('prev')}
                                className="p-2 text-gray-500 hover:text-gray-900 hover:bg-white hover:shadow-sm rounded-lg transition-all"
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
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                                </svg>
                            </button>
                        </div>
                        <div className="flex gap-4">
                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 self-center">Step:</span>
                            <span className="px-3 py-1 bg-blue-50 text-blue-700 text-[10px] font-black uppercase tracking-widest rounded border border-blue-100 flex items-center">
                                Submit Worked Hours
                            </span>
                        </div>
                    </div>

                    {loading ? (
                        <div className="flex justify-center py-20">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {shifts.length === 0 ? (
                                <div className="card-base p-10 text-center border-2 border-dashed border-gray-100">
                                    <p className="text-sm font-bold text-gray-400 uppercase tracking-widest italic">No approved shifts to confirm for this week</p>
                                </div>
                            ) : (
                                shifts.map((shift) => {
                                    const timesheet = getTimesheetForShift(shift.id!);
                                    const isEditing = editMode === shift.id;
                                    const isSubmitting = submitting === shift.id;

                                    return (
                                        <div key={shift.id} className="card-base p-6 hover:border-gray-200 transition-colors group">
                                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                                                <div className="flex items-center gap-6">
                                                    <div className="bg-white p-3 rounded-lg border border-gray-100 shadow-sm">
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600" viewBox="0 0 20 20" fill="currentColor">
                                                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                                                        </svg>
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-black text-gray-400 uppercase tracking-widest mb-1">{getDayName(shift.date.toDate().getDay())}</p>
                                                        <p className="text-lg font-black text-gray-900 tracking-tight">
                                                            {formatDate(shift.date.toDate())}
                                                        </p>
                                                        <p className="text-xs font-bold text-blue-600 uppercase tracking-widest mt-0.5">
                                                            Rostered: {shift.startTime} - {shift.endTime}
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="flex flex-col md:items-end gap-3">
                                                    {timesheet ? (
                                                        <div className="flex flex-col items-end gap-2">
                                                            <div className="text-right">
                                                                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Worked Hours</p>
                                                                <p className="text-sm font-black text-gray-900">{timesheet.workedStart} - {timesheet.workedEnd}</p>
                                                            </div>
                                                            {getStatusBadge(timesheet.status)}
                                                        </div>
                                                    ) : isEditing ? (
                                                        <div className="flex flex-col gap-4 w-full md:w-auto">
                                                            <div className="flex items-center gap-3">
                                                                <div className="flex flex-col gap-1">
                                                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Start</label>
                                                                    <input
                                                                        type="time"
                                                                        value={workedStart}
                                                                        onChange={(e) => setWorkedStart(e.target.value)}
                                                                        className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold focus:ring-2 focus:ring-blue-100 outline-none"
                                                                    />
                                                                </div>
                                                                <div className="flex flex-col gap-1">
                                                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">End</label>
                                                                    <input
                                                                        type="time"
                                                                        value={workedEnd}
                                                                        onChange={(e) => setWorkedEnd(e.target.value)}
                                                                        className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold focus:ring-2 focus:ring-blue-100 outline-none"
                                                                    />
                                                                </div>
                                                            </div>
                                                            <div className="flex gap-2">
                                                                <button
                                                                    onClick={() => setEditMode(null)}
                                                                    className="px-4 py-2 text-xs font-bold text-gray-500 hover:bg-gray-100 rounded-lg transition-colors capitalize"
                                                                >
                                                                    Cancel
                                                                </button>
                                                                <button
                                                                    onClick={() => handleSubmitTimesheet(shift)}
                                                                    disabled={isSubmitting}
                                                                    className="px-6 py-2 bg-blue-600 text-white text-xs font-black uppercase tracking-widest rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                                                                >
                                                                    {isSubmitting ? 'Submitting...' : 'Submit Confirm'}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            onClick={() => handleStartEdit(shift)}
                                                            className="px-6 py-2.5 bg-white border border-blue-600 text-blue-600 text-xs font-black uppercase tracking-widest rounded-lg hover:bg-blue-50 transition-colors shadow-sm"
                                                        >
                                                            Create Timesheet
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    )}
                </main>
            </div>
        </ProtectedRoute>
    );
}
