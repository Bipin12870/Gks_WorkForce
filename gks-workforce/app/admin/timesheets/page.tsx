'use client';

import { useState, useEffect } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, Timestamp, updateDoc, doc, getDocs } from 'firebase/firestore';
import { Shift, Timesheet, TimesheetStatus, User } from '@/types';
import { getWeekStart, formatDate, calculateHours, getDayName, isValidInterval } from '@/lib/utils';
import { useRouter, useSearchParams } from 'next/navigation';
import { useNotification } from '@/contexts/NotificationContext';
import Logo from '@/components/Logo';
import TimePicker from '@/components/ui/TimePicker';
import { Suspense } from 'react';

export default function AdminTimesheetsPage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <AdminTimesheetsContent />
        </Suspense>
    );
}

function AdminTimesheetsContent() {
    const { userData } = useAuth();
    const router = useRouter();
    const { showNotification } = useNotification();
    const [selectedWeek, setSelectedWeek] = useState<Date>(getWeekStart(new Date()));
    const [selectedDay, setSelectedDay] = useState<number>(new Date().getDay());
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
    const [staffMap, setStaffMap] = useState<Record<string, User>>({});
    const [loading, setLoading] = useState(true);
    const searchParams = useSearchParams();
    const [selectedStaffFilter, setSelectedStaffFilter] = useState<string>('ALL');
    const [filterMode, setFilterMode] = useState<'HARD' | 'HIGHLIGHT'>('HARD');
    const [activeMobileTab, setActiveMobileTab] = useState<'roster' | 'timesheets'>('roster');
    const [showFlaggedOnly, setShowFlaggedOnly] = useState(false);
    const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');

    useEffect(() => {
        const filter = searchParams.get('filter');
        if (filter === 'flagged') {
            setShowFlaggedOnly(true);
            setStatusFilter('PENDING');
            setSelectedDay(-1); // Show all days for the week
            setActiveMobileTab('timesheets');
        } else if (filter === 'pending') {
            setStatusFilter('PENDING');
            setSelectedDay(-1); // Show all days for the week
            setActiveMobileTab('timesheets');
        }
    }, [searchParams]);

    // Adjustment Modal State
    const [showAdjustModal, setShowAdjustModal] = useState(false);
    const [selectedTimesheet, setSelectedTimesheet] = useState<Timesheet | null>(null);
    const [adjustStart, setAdjustStart] = useState('');
    const [adjustEnd, setAdjustEnd] = useState('');
    const [adminNote, setAdminNote] = useState('');

    useEffect(() => {
        if (userData?.role === 'ADMIN') {
            loadStaff();
        }
    }, [userData]);

    useEffect(() => {
        if (!userData || userData.role !== 'ADMIN') return;

        setLoading(true);
        const weekStart = new Date(selectedWeek);
        const weekEnd = new Date(selectedWeek);
        weekEnd.setDate(weekEnd.getDate() + 7);

        let startDate = weekStart;
        let endDate = weekEnd;

        if (selectedDay !== -1) {
            const dayDate = new Date(selectedWeek);
            dayDate.setDate(dayDate.getDate() + (selectedDay === 0 ? 6 : selectedDay - 1));
            dayDate.setHours(0, 0, 0, 0);

            const nextDay = new Date(dayDate);
            nextDay.setDate(nextDay.getDate() + 1);

            startDate = dayDate;
            endDate = nextDay;
        }

        const shiftsQuery = query(
            collection(db, 'shifts'),
            where('status', '==', 'APPROVED'),
            where('date', '>=', Timestamp.fromDate(startDate)),
            where('date', '<', Timestamp.fromDate(endDate))
        );

        const unsubscribeShifts = onSnapshot(shiftsQuery,
            (snapshot) => {
                const loadedShifts: Shift[] = [];
                snapshot.forEach((doc) => {
                    loadedShifts.push({ id: doc.id, ...doc.data() } as Shift);
                });
                loadedShifts.sort((a, b) => a.startTime.localeCompare(b.startTime));
                setShifts(loadedShifts);
            },
            (error) => {
                console.error('Error fetching shifts:', error);
                showNotification('Failed to load rostered shifts.', 'error');
            }
        );

        const timesheetsQuery = query(
            collection(db, 'timesheets'),
            where('date', '>=', Timestamp.fromDate(startDate)),
            where('date', '<', Timestamp.fromDate(endDate))
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

    const handleUpdateStatus = async (
        timesheetId: string,
        status: TimesheetStatus,
        workedStart?: string,
        workedEnd?: string,
        note?: string
    ) => {
        if (workedStart && !isValidInterval(workedStart)) {
            showNotification('Start time must be in 15-minute intervals', 'error');
            return;
        }
        if (workedEnd && !isValidInterval(workedEnd)) {
            showNotification('End time must be in 15-minute intervals', 'error');
            return;
        }

        try {
            const updates: any = { status, updatedAt: Timestamp.now() };
            if (workedStart) updates.workedStart = workedStart;
            if (workedEnd) updates.workedEnd = workedEnd;
            if (note !== undefined) updates.adminNote = note;

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
        setAdminNote(ts.adminNote || '');
        setShowAdjustModal(true);
    };

    const getSourceBadge = (ts: Timesheet) => {
        if (!ts.source) return null;

        switch (ts.source) {
            case 'MANUAL':
                return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-50 text-gray-600 text-[10px] font-black uppercase tracking-widest rounded border border-gray-200"><span className="text-sm">✏️</span> Manual</span>;
            case 'GPS_VERIFIED':
                return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-50 text-green-700 text-[10px] font-black uppercase tracking-widest rounded border border-green-200"><span className="text-sm">📍</span> GPS Verified</span>;
            case 'GPS_OVERTIME':
                return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-purple-50 text-purple-700 text-[10px] font-black uppercase tracking-widest rounded border border-purple-200"><span className="text-sm">⏱️</span> Overtime</span>;
            case 'GPS_OUTSIDE':
                return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-50 text-red-700 text-[10px] font-black uppercase tracking-widest rounded border border-red-200"><span className="text-sm">⚠️</span> Off-Site ({ts.clockOutDistanceMetres}m)</span>;
            case 'AUTO_CLOSED':
                return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-orange-50 text-orange-700 text-[10px] font-black uppercase tracking-widest rounded border border-orange-200"><span className="text-sm">🕐</span> Auto-Closed</span>;
            case 'GPS_UNMATCHED':
                return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 text-amber-700 text-[10px] font-black uppercase tracking-widest rounded border border-amber-200"><span className="text-sm">❓</span> Unmatched Shift</span>;
            default:
                return null;
        }
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

    const renderRosteredShifts = () => (
        <div className="space-y-4">
            <div className="flex items-center justify-between px-2">
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">
                    Rostered Shifts: {selectedDay === -1 ? 'Full Week' : getDayName(selectedDay)}
                </h3>
                <div className="text-[10px] font-bold text-gray-400 italic">Read-Only</div>
            </div>
            {loading ? (
                <div className="flex justify-center py-10"><div className="animate-spin h-6 w-6 border-b-2 border-gray-400"></div></div>
            ) : (() => {
                // If All Week is selected (-1), we force hard filter for clarity
                const shouldHardFilter = filterMode === 'HARD' || selectedDay === -1;
                const rosterShifts = shouldHardFilter && selectedStaffFilter !== 'ALL'
                    ? shifts.filter(s => s.staffId === selectedStaffFilter)
                    : shifts;

                return rosterShifts.length === 0 ? (
                    <div className="card-base p-10 text-center border-dashed">
                        <p className="text-sm font-medium text-gray-400 italic">No approved shifts for this criteria</p>
                    </div>
                ) : (
                    rosterShifts.map((shift) => (
                        <div
                            key={shift.id}
                            onClick={() => {
                                // Container filtering only triggers when viewing ALL week and no master filter is active
                                if (selectedDay === -1) {
                                    if (selectedStaffFilter === 'ALL') {
                                        setSelectedStaffFilter(shift.staffId);
                                        setFilterMode('HIGHLIGHT');
                                    } else if (filterMode === 'HIGHLIGHT' && selectedStaffFilter === shift.staffId) {
                                        setSelectedStaffFilter('ALL');
                                    }
                                }
                            }}
                            className={`card-base p-5 transition-all cursor-pointer ${selectedStaffFilter === shift.staffId
                                ? 'bg-blue-50/50 border-blue-500 ring-2 ring-blue-100'
                                : 'bg-gray-50/30 border-gray-100 hover:border-blue-200'
                                }`}
                        >
                            <div className="flex justify-between items-center">
                                <div>
                                    <p className="font-bold text-gray-900 mb-0.5">{staffMap[shift.staffId]?.name || 'Unknown Staff'}</p>
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
                                        {getDayName(shift.date.toDate().getDay())}, {formatDate(shift.date.toDate())}
                                    </p>
                                    <div className="inline-flex items-center gap-2 bg-white px-2 py-1 rounded border border-gray-100 text-xs font-bold text-gray-600 tabular-nums">
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
                );
            })()}
        </div>
    );

    const renderSubmittedTimesheets = () => (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-2 pb-2 border-b border-gray-100">
                <div className="flex flex-col">
                    <h3 className="text-xs font-black text-blue-600 uppercase tracking-widest">
                        {statusFilter === 'ALL' ? 'Submitted Timesheets' : `${statusFilter} Timesheets`}
                    </h3>
                    <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wide">
                        {statusFilter === 'PENDING' ? 'Action Required' : 'Historical Archive'}
                    </span>
                </div>
                <div className="flex items-center gap-1.5 self-end sm:self-auto">
                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Status:</span>
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as any)}
                        className="px-2 py-1 bg-white border border-gray-200 rounded-lg text-[11px] font-black text-blue-600 outline-none shadow-sm cursor-pointer hover:border-blue-200 transition-colors uppercase tracking-wider"
                    >
                        <option value="ALL">All Statuses</option>
                        <option value="PENDING">Pending</option>
                        <option value="APPROVED">Approved</option>
                        <option value="REJECTED">Rejected</option>
                    </select>
                </div>
            </div>
            {loading ? (
                <div className="flex justify-center py-10"><div className="animate-spin h-6 w-6 border-b-2 border-blue-600"></div></div>
            ) : (() => {
                let filteredTimesheets = selectedStaffFilter === 'ALL' ? timesheets : timesheets.filter(t => t.staffId === selectedStaffFilter);
                
                if (statusFilter !== 'ALL') {
                    filteredTimesheets = filteredTimesheets.filter(t => t.status === statusFilter);
                }
                
                if (showFlaggedOnly) {
                    filteredTimesheets = filteredTimesheets.filter(t => t.requiresAdminNote && t.status === 'PENDING');
                }
                return filteredTimesheets.length === 0 ? (
                    <div className="card-base p-10 text-center border-dashed border-blue-100 bg-blue-50/10">
                        <p className="text-sm font-medium text-blue-400 italic">
                            {selectedStaffFilter !== 'ALL'
                                ? `No timesheets submitted for ${staffMap[selectedStaffFilter]?.name}`
                                : 'No timesheets submitted for this criteria'}
                        </p>
                    </div>
                ) : (
                    filteredTimesheets.map((ts) => {
                        const approvedHours = calculateHours(ts.approvedShiftStart, ts.approvedShiftEnd);
                        const workedHours = calculateHours(ts.workedStart, ts.workedEnd);
                        const diff = workedHours - approvedHours;

                        return (
                            <div key={ts.id} className={`card-base p-0 overflow-hidden hover:border-blue-300 transition-colors shadow-sm bg-white border ${ts.requiresAdminNote ? 'border-red-200' : 'border-blue-100'
                                }`}>
                                {/* Top Banner for GPS Source */}
                                <div className={`px-5 py-2.5 flex items-center justify-between border-b ${ts.requiresAdminNote ? 'bg-red-50/50 border-red-100' : 'bg-blue-50/30 border-blue-100'
                                    }`}>
                                    <div className="flex items-center gap-2">
                                        {getSourceBadge(ts)}
                                    </div>
                                    {ts.requiresAdminNote && ts.status === 'PENDING' && (
                                        <span className="text-[10px] font-black text-red-600 uppercase tracking-widest animate-pulse">
                                            Review Required
                                        </span>
                                    )}
                                </div>

                                <div className="p-5">
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

                                    <div className="mb-6 flex items-center justify-between">
                                        <div>
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Submitted Worked Hours</p>
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-bold bg-white px-2 py-1 rounded border border-gray-100 shadow-sm">{ts.workedStart} - {ts.workedEnd}</span>
                                            </div>
                                        </div>
                                        {ts.adminNote && (
                                            <div className="text-right max-w-[50%]">
                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Admin Note</p>
                                                <p className="text-[10px] text-gray-600 italic bg-gray-50 px-2 py-1 rounded line-clamp-2">"{ts.adminNote}"</p>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex flex-wrap gap-2 pt-4 border-t border-gray-100">
                                        {ts.status === 'PENDING' && !ts.requiresAdminNote && (
                                            <button
                                                onClick={() => handleUpdateStatus(ts.id!, 'APPROVED')}
                                                className="px-4 py-2 bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                                            >
                                                Quick Approve
                                            </button>
                                        )}

                                        {ts.status === 'PENDING' && ts.requiresAdminNote && (
                                            <button
                                                onClick={() => openAdjustModal(ts)}
                                                className="px-4 py-2 bg-amber-500 text-white text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-amber-600 transition-colors shadow-sm"
                                            >
                                                Review & Resolve
                                            </button>
                                        )}

                                        {(!ts.requiresAdminNote || ts.status !== 'PENDING') && (
                                            <button
                                                onClick={() => openAdjustModal(ts)}
                                                className="px-4 py-2 bg-white border border-gray-200 text-gray-600 text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-gray-50 transition-colors"
                                            >
                                                {ts.status === 'PENDING' ? 'Adjust & Approve' : 'Correct & Update'}
                                            </button>
                                        )}

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
                            </div>
                        );
                    })
                );
            })()}
        </div>
    );

    return (
        <ProtectedRoute requiredRole="ADMIN">
            <div className="min-h-screen bg-background text-gray-900">
                <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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
                    </div>
                </header>

                <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    {showFlaggedOnly && (
                        <div className="mb-8 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between animate-in slide-in-from-top-4 duration-500">
                            <div className="flex items-center gap-3">
                                <span className="text-xl">⚠️</span>
                                <div>
                                    <p className="text-sm font-bold text-amber-900">Viewing Flagged Issues Only</p>
                                    <p className="text-xs text-amber-700">Showing all pending timesheets with geofence or overtime violations for this week.</p>
                                </div>
                            </div>
                            <button
                                onClick={() => {
                                    setShowFlaggedOnly(false);
                                    setSelectedDay(new Date().getDay()); // Reset to today
                                    router.replace('/admin/timesheets'); // Clean URL
                                }}
                                className="px-4 py-2 bg-amber-100 hover:bg-amber-200 text-amber-900 text-xs font-black uppercase tracking-widest rounded-lg transition-colors"
                            >
                                Clear Filter
                            </button>
                        </div>
                    )}

                    {/* Selectors Section */}
                    <div className="card-base p-4 sm:p-6 mb-8 border-blue-100 bg-white shadow-sm">
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                            <div className="flex flex-col sm:flex-row items-center gap-4">
                                <div className="flex items-center bg-gray-50 p-1 rounded-xl border border-gray-100 w-full sm:w-auto justify-between sm:justify-start">
                                    <button
                                        onClick={() => changeWeek('prev')}
                                        className="p-2 text-gray-500 hover:text-gray-900 hover:bg-white hover:shadow-sm rounded-lg transition-all"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                                        </svg>
                                    </button>
                                    <div className="px-4 sm:px-6 py-1.5 text-sm font-bold text-gray-900 whitespace-nowrap min-w-[140px] sm:min-w-[180px] text-center uppercase tracking-widest">
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
                                <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                                    <div className="flex items-center gap-3 flex-1 sm:flex-none min-w-[140px]">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 hidden sm:block">Filter Day:</label>
                                        <select
                                            value={selectedDay}
                                            onChange={(e) => setSelectedDay(Number(e.target.value))}
                                            className="flex-1 sm:flex-none px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-100 outline-none shadow-sm cursor-pointer"
                                        >
                                            <option value={-1}>All Week</option>
                                            {[1, 2, 3, 4, 5, 6, 0].map((day) => (
                                                <option key={day} value={day}>{getDayName(day)}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="flex items-center gap-3 flex-1 sm:flex-none min-w-[140px]">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 hidden sm:block">Filter Staff:</label>
                                        <select
                                            value={selectedStaffFilter}
                                            onChange={(e) => {
                                                setSelectedStaffFilter(e.target.value);
                                                setFilterMode('HARD');
                                            }}
                                            className="flex-1 sm:flex-none px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-100 outline-none shadow-sm cursor-pointer"
                                        >
                                            <option value="ALL">All Staff</option>
                                            {Object.values(staffMap).map((staff) => (
                                                <option key={staff.id} value={staff.id}>{staff.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Desktop/Tablet Layout - Grid */}
                    <div className="hidden lg:grid lg:grid-cols-2 gap-10">
                        {renderRosteredShifts()}
                        {renderSubmittedTimesheets()}
                    </div>

                    {/* Mobile/Tablet Layout - Tabbed */}
                    <div className="lg:hidden">
                        <div className="card-base">
                            <div className="flex border-b border-gray-100">
                                <button
                                    onClick={() => setActiveMobileTab('roster')}
                                    className={`flex-1 px-4 py-3 text-xs font-bold uppercase tracking-wider transition-all ${activeMobileTab === 'roster'
                                        ? 'bg-white text-blue-600 border-b-2 border-blue-600'
                                        : 'text-gray-400 hover:text-gray-600'
                                        }`}
                                >
                                    Rostered Shifts
                                </button>
                                <button
                                    onClick={() => setActiveMobileTab('timesheets')}
                                    className={`flex-1 px-4 py-3 text-xs font-bold uppercase tracking-wider transition-all ${activeMobileTab === 'timesheets'
                                        ? 'bg-white text-blue-600 border-b-2 border-blue-600'
                                        : 'text-gray-400 hover:text-gray-600'
                                        }`}
                                >
                                    Timesheets
                                </button>
                            </div>
                            <div className="p-4 min-h-[400px]">
                                {activeMobileTab === 'roster' ? renderRosteredShifts() : renderSubmittedTimesheets()}
                            </div>
                        </div>
                    </div>
                </main>

                {/* Adjustment / Resolution Modal */}
                {showAdjustModal && selectedTimesheet && (
                    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
                        <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-gray-200 overflow-hidden flex flex-col max-h-[90vh]">
                            <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center shrink-0">
                                <div>
                                    <h3 className="text-lg font-black text-gray-900 tracking-tight">
                                        {selectedTimesheet.requiresAdminNote && selectedTimesheet.status === 'PENDING' ? 'Resolve Timesheet Issue' : 'Adjust Worked Time'}
                                    </h3>
                                    {selectedTimesheet.requiresAdminNote && (
                                        <p className="text-xs text-amber-600 font-bold mt-1">This record requires admin review.</p>
                                    )}
                                </div>
                                <button onClick={() => setShowAdjustModal(false)} className="text-gray-400 hover:text-gray-600">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                    </svg>
                                </button>
                            </div>

                            <div className="p-6 overflow-y-auto">
                                <div className="mb-6 p-4 bg-blue-50/50 border border-blue-100 rounded-xl flex justify-between items-center">
                                    <div>
                                        <p className="text-[10px] font-black text-blue-700 uppercase tracking-widest mb-1">Approved Roster</p>
                                        <p className="text-sm font-bold text-gray-900">{selectedTimesheet.approvedShiftStart} - {selectedTimesheet.approvedShiftEnd}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Submitted</p>
                                        <p className="text-sm font-bold text-gray-600">{selectedTimesheet.workedStart} - {selectedTimesheet.workedEnd}</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4 mb-6">
                                    <div>
                                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Adjusted Start</label>
                                        <TimePicker
                                            value={adjustStart}
                                            onChange={(val) => setAdjustStart(val)}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Adjusted End</label>
                                        <TimePicker
                                            value={adjustEnd}
                                            onChange={(val) => setAdjustEnd(val)}
                                        />
                                    </div>
                                </div>

                                {(selectedTimesheet.requiresAdminNote || adminNote) && (
                                    <div className="mb-8">
                                        <label className="block text-[10px] font-black text-gray-600 uppercase tracking-widest mb-2">
                                            Admin Note <span className="text-red-500">*</span>
                                        </label>
                                        <textarea
                                            value={adminNote}
                                            onChange={(e) => setAdminNote(e.target.value)}
                                            placeholder="Explain why this overtime/off-site record was approved..."
                                            className="input-base min-h-[80px] resize-none"
                                            required={selectedTimesheet.requiresAdminNote}
                                        />
                                    </div>
                                )}

                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setShowAdjustModal(false)}
                                        className="btn-secondary flex-1"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={() => {
                                            if (selectedTimesheet.requiresAdminNote && !adminNote.trim()) {
                                                showNotification('Admin note is required to resolve this record', 'error');
                                                return;
                                            }
                                            handleUpdateStatus(selectedTimesheet.id!, 'APPROVED', adjustStart, adjustEnd, adminNote);
                                        }}
                                        className="btn-primary flex-1 bg-amber-500 hover:bg-amber-600"
                                    >
                                        {selectedTimesheet.requiresAdminNote && selectedTimesheet.status === 'PENDING' ? 'Resolve & Approve' : 'Approve Adjusted'}
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
