'use client';

import { useState, useEffect } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, Timestamp, updateDoc, doc, getDocs } from 'firebase/firestore';
import { Shift, Timesheet, TimesheetStatus, User } from '@/types';
import { getWeekStart, formatDate, calculateHours, getDayName } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { useNotification } from '@/contexts/NotificationContext';
import Logo from '@/components/Logo';

export default function AdminTimesheetsPage() {
    const { userData } = useAuth();
    const router = useRouter();
    const { showNotification } = useNotification();
    const [selectedWeek, setSelectedWeek] = useState<Date>(getWeekStart(new Date()));
    const [selectedDay, setSelectedDay] = useState<number>(new Date().getDay());
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
    const [staffMap, setStaffMap] = useState<Record<string, User>>({});
    const [loading, setLoading] = useState(true);

    // Adjustment Modal State
    const [showAdjustModal, setShowAdjustModal] = useState(false);
    const [selectedTimesheet, setSelectedTimesheet] = useState<Timesheet | null>(null);
    const [adjustStart, setAdjustStart] = useState('');
    const [adjustEnd, setAdjustEnd] = useState('');

    useEffect(() => {
        if (userData?.role === 'ADMIN') {
            loadStaff();
        }
    }, [userData]);

    useEffect(() => {
        if (!userData || userData.role !== 'ADMIN') return;

        setLoading(true);
        const dayDate = new Date(selectedWeek);
        // Correctly calculate the date for the selected day of current week start (Monday)
        dayDate.setDate(dayDate.getDate() + (selectedDay === 0 ? 6 : selectedDay - 1));
        dayDate.setHours(0, 0, 0, 0);

        const nextDay = new Date(dayDate);
        nextDay.setDate(nextDay.getDate() + 1);

        // Listen for approved shifts for the specific day
        const shiftsQuery = query(
            collection(db, 'shifts'),
            where('status', '==', 'APPROVED'),
            where('date', '>=', Timestamp.fromDate(dayDate)),
            where('date', '<', Timestamp.fromDate(nextDay))
        );

        const unsubscribeShifts = onSnapshot(shiftsQuery,
            (snapshot) => {
                const loadedShifts: Shift[] = [];
                snapshot.forEach((doc) => {
                    loadedShifts.push({ id: doc.id, ...doc.data() } as Shift);
                });
                // Sort by start time
                loadedShifts.sort((a, b) => a.startTime.localeCompare(b.startTime));
                setShifts(loadedShifts);
            },
            (error) => {
                console.error('Error fetching shifts:', error);
                showNotification('Failed to load rostered shifts.', 'error');
            }
        );

        // Listen for all timesheets for the specific day
        const timesheetsQuery = query(
            collection(db, 'timesheets'),
            where('date', '>=', Timestamp.fromDate(dayDate)),
            where('date', '<', Timestamp.fromDate(nextDay))
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
    }, [selectedWeek, selectedDay, userData]);

    const loadStaff = async () => {
        if (!userData || userData.role !== 'ADMIN') return;
        const snapshot = await getDocs(collection(db, 'users'));
        const map: Record<string, User> = {};
        snapshot.forEach((doc) => {
            map[doc.id] = { id: doc.id, ...doc.data() } as User;
        });
        setStaffMap(map);
    };

    const changeWeek = (direction: 'prev' | 'next') => {
        const newWeek = new Date(selectedWeek);
        newWeek.setDate(newWeek.getDate() + (direction === 'next' ? 7 : -7));
        setSelectedWeek(getWeekStart(newWeek));
    };

    const handleUpdateStatus = async (timesheetId: string, status: TimesheetStatus, workedStart?: string, workedEnd?: string) => {
        try {
            const updates: any = { status, updatedAt: Timestamp.now() };
            if (workedStart) updates.workedStart = workedStart;
            if (workedEnd) updates.workedEnd = workedEnd;

            await updateDoc(doc(db, 'timesheets', timesheetId), updates);
            showNotification(`Timesheet ${status.toLowerCase()} successfully`, 'success');
            setShowAdjustModal(false);
        } catch (error) {
            console.error('Error updating timesheet:', error);
            showNotification('Failed to update timesheet', 'error');
        }
    };

    const openAdjustModal = (ts: Timesheet) => {
        setSelectedTimesheet(ts);
        setAdjustStart(ts.workedStart);
        setAdjustEnd(ts.workedEnd);
        setShowAdjustModal(true);
    };

    const getTimesheetForShift = (shiftId: string) => {
        return timesheets.find(ts => ts.shiftId === shiftId);
    };

    const getStatusBadge = (status: TimesheetStatus) => {
        switch (status) {
            case 'PENDING':
                return <span className="px-2 py-0.5 bg-yellow-50 text-yellow-700 text-[10px] font-black uppercase tracking-wider rounded border border-yellow-100 italic">Pending Approval</span>;
            case 'APPROVED':
                return <span className="px-2 py-0.5 bg-green-50 text-green-700 text-[10px] font-black uppercase tracking-wider rounded border border-green-100">Approved</span>;
            case 'REJECTED':
                return <span className="px-2 py-0.5 bg-red-50 text-red-700 text-[10px] font-black uppercase tracking-wider rounded border border-red-100">Rejected</span>;
            default:
                return null;
        }
    };

    return (
        <ProtectedRoute requiredRole="ADMIN">
            <div className="min-h-screen bg-background text-gray-900">
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
                                <h1 className="text-xl font-bold text-gray-900 tracking-tight">Timesheet Approval</h1>
                            </div>
                        </div>
                    </div>
                </header>

                <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    {/* Selectors Section */}
                    <div className="card-base p-6 mb-8">
                        <div className="flex flex-col gap-6">
                            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                                <div className="flex items-center bg-gray-50 p-1 rounded-xl border border-gray-100">
                                    <button
                                        onClick={() => changeWeek('prev')}
                                        className="p-2 text-gray-500 hover:text-gray-900 hover:bg-white hover:shadow-sm rounded-lg transition-all"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                                        </svg>
                                    </button>
                                    <div className="px-6 py-1.5 text-sm font-bold text-gray-900 whitespace-nowrap min-w-[200px] text-center uppercase tracking-widest">
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
                                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 self-center">View Type:</span>
                                    <span className="px-3 py-1 bg-green-50 text-green-700 text-[10px] font-black uppercase tracking-widest rounded border border-green-100 flex items-center">
                                        Shift vs Timesheet Sync
                                    </span>
                                </div>
                            </div>

                            <div className="flex gap-1.5 bg-gray-50 p-1 rounded-xl border border-gray-100 overflow-x-auto">
                                {[1, 2, 3, 4, 5, 6, 0].map((day) => (
                                    <button
                                        key={day}
                                        onClick={() => setSelectedDay(day)}
                                        className={`px-4 py-2 text-xs font-bold uppercase tracking-tight rounded-lg transition-all whitespace-nowrap ${selectedDay === day
                                            ? 'bg-white text-blue-600 shadow-sm'
                                            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100/50'
                                            }`}
                                    >
                                        {getDayName(day)}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                        {/* LEFT VIEW - Approved Roster (Read-Only) */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between px-2">
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Rostered Shifts: {getDayName(selectedDay)}</h3>
                                <div className="text-[10px] font-bold text-gray-400 italic">Read-Only</div>
                            </div>
                            {loading ? (
                                <div className="flex justify-center py-10"><div className="animate-spin h-6 w-6 border-b-2 border-gray-400"></div></div>
                            ) : shifts.length === 0 ? (
                                <div className="card-base p-10 text-center border-dashed">
                                    <p className="text-sm font-medium text-gray-400 italic">No approved shifts for this day</p>
                                </div>
                            ) : (
                                shifts.map((shift) => (
                                    <div key={shift.id} className="card-base p-5 bg-gray-50/30 border-gray-100">
                                        <div className="flex justify-between items-center">
                                            <div>
                                                <p className="font-bold text-gray-900 mb-0.5">{staffMap[shift.staffId]?.name || 'Unknown Staff'}</p>
                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
                                                    {getDayName(shift.date.toDate().getDay())}, {formatDate(shift.date.toDate())}
                                                </p>
                                                <div className="inline-flex items-center gap-2 bg-white px-2 py-1 rounded border border-gray-100 text-xs font-bold text-gray-600">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                                                    </svg>
                                                    {shift.startTime} - {shift.endTime}
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Duration</p>
                                                <p className="text-sm font-black text-gray-900">{calculateHours(shift.startTime, shift.endTime).toFixed(2)} hrs</p>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* RIGHT VIEW - Timesheets (Actionable) */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between px-2">
                                <h3 className="text-xs font-black text-blue-600 uppercase tracking-widest">Submitted Timesheets</h3>
                                <div className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Action Required</div>
                            </div>
                            {loading ? (
                                <div className="flex justify-center py-10"><div className="animate-spin h-6 w-6 border-b-2 border-blue-600"></div></div>
                            ) : timesheets.length === 0 ? (
                                <div className="card-base p-10 text-center border-dashed border-blue-100 bg-blue-50/10">
                                    <p className="text-sm font-medium text-blue-400 italic">No timesheets submitted for this day</p>
                                </div>
                            ) : (
                                timesheets.map((ts) => {
                                    const approvedHours = calculateHours(ts.approvedShiftStart, ts.approvedShiftEnd);
                                    const workedHours = calculateHours(ts.workedStart, ts.workedEnd);
                                    const diff = workedHours - approvedHours;

                                    return (
                                        <div key={ts.id} className="card-base p-5 border-blue-100 hover:border-blue-300 transition-colors shadow-sm bg-white">
                                            <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                                <div>
                                                    <p className="font-black text-gray-900 text-lg tracking-tight">{staffMap[ts.staffId]?.name || 'Staff Member'}</p>
                                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                                        Shift: {formatDate(ts.date.toDate())} ({ts.approvedShiftStart}-{ts.approvedShiftEnd})
                                                    </p>
                                                </div>
                                                {getStatusBadge(ts.status)}
                                            </div>

                                            <div className="grid grid-cols-3 gap-2 mb-6 bg-gray-50 p-4 rounded-xl border border-gray-100">
                                                <div>
                                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Approved</p>
                                                    <p className="text-sm font-bold text-gray-900">{approvedHours.toFixed(2)}h</p>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1">Worked</p>
                                                    <p className="text-sm font-black text-blue-600">{workedHours.toFixed(2)}h</p>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Diff</p>
                                                    <p className={`text-sm font-black ${diff > 0 ? 'text-orange-600' : diff < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                                                        {diff > 0 ? '+' : ''}{diff.toFixed(2)}h
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="mb-6">
                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Submitted Worked Hours</p>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-bold bg-white px-2 py-1 rounded border border-gray-100 shadow-sm">{ts.workedStart} - {ts.workedEnd}</span>
                                                </div>
                                            </div>

                                            <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
                                                {ts.status === 'PENDING' && (
                                                    <button
                                                        onClick={() => handleUpdateStatus(ts.id!, 'APPROVED')}
                                                        className="px-4 py-2 bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                                                    >
                                                        Quick Approve
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => openAdjustModal(ts)}
                                                    className="px-4 py-2 bg-white border border-gray-200 text-gray-600 text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-gray-50 transition-colors"
                                                >
                                                    {ts.status === 'PENDING' ? 'Adjust & Approve' : 'Correct & Update'}
                                                </button>
                                                {ts.status !== 'REJECTED' && (
                                                    <button
                                                        onClick={() => handleUpdateStatus(ts.id!, 'REJECTED')}
                                                        className="px-4 py-2 bg-white border border-red-100 text-red-600 text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-red-50 transition-colors"
                                                    >
                                                        Reject
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </main>

                {/* Adjustment Modal */}
                {showAdjustModal && selectedTimesheet && (
                    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
                        <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-gray-200 overflow-hidden">
                            <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                                <h3 className="text-lg font-black text-gray-900 tracking-tight">Adjust Worked Time</h3>
                                <button onClick={() => setShowAdjustModal(false)} className="text-gray-400 hover:text-gray-600">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                    </svg>
                                </button>
                            </div>

                            <div className="p-6">
                                <div className="mb-6 p-4 bg-blue-50/50 border border-blue-100 rounded-xl">
                                    <p className="text-[10px] font-black text-blue-700 uppercase tracking-widest mb-1">Approved Roster</p>
                                    <p className="text-sm font-bold text-gray-900">{selectedTimesheet.approvedShiftStart} - {selectedTimesheet.approvedShiftEnd}</p>
                                </div>

                                <div className="grid grid-cols-2 gap-4 mb-8">
                                    <div>
                                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Adjusted Start</label>
                                        <input
                                            type="time"
                                            value={adjustStart}
                                            onChange={(e) => setAdjustStart(e.target.value)}
                                            className="input-base"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Adjusted End</label>
                                        <input
                                            type="time"
                                            value={adjustEnd}
                                            onChange={(e) => setAdjustEnd(e.target.value)}
                                            className="input-base"
                                        />
                                    </div>
                                </div>

                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setShowAdjustModal(false)}
                                        className="btn-secondary flex-1"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={() => handleUpdateStatus(selectedTimesheet.id!, 'APPROVED', adjustStart, adjustEnd)}
                                        className="btn-primary flex-1"
                                    >
                                        Approve Adjusted
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </ProtectedRoute>
    );
}
