'use client';

import { useState, useEffect } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import {
    collection,
    query,
    where,
    onSnapshot,
    addDoc,
    getDocs,
    Timestamp,
    updateDoc,
    deleteDoc,
    doc,
} from 'firebase/firestore';
import { Availability, Shift, User, RosterAuditLog } from '@/types';
import { getWeekStart, getDayName, formatDate, isWithinAvailability, isTimeBefore, calculateHours, SHOP_OPEN_TIME, SHOP_CLOSE_TIME, isValidInterval, normalizeTo15Minutes } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { useNotification } from '@/contexts/NotificationContext';
import Logo from '@/components/Logo';

export default function AdminRosterPage() {
    const { userData } = useAuth();
    const router = useRouter();
    const { showNotification } = useNotification();
    const [selectedWeek, setSelectedWeek] = useState<Date>(getWeekStart(new Date()));
    const [selectedDay, setSelectedDay] = useState<number>(new Date().getDay());
    const [availability, setAvailability] = useState<Availability[]>([]);
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [staffMap, setStaffMap] = useState<Record<string, User>>({});
    const [showApprovalModal, setShowApprovalModal] = useState(false);
    const [selectedStaff, setSelectedStaff] = useState<{ id: string; name: string; ranges: any[]; dayOfWeek?: number } | null>(null);
    const [shiftForm, setShiftForm] = useState({ startTime: '09:00', endTime: '17:00' });
    const [isEditingShift, setIsEditingShift] = useState(false);
    const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
    const [activeMobileTab, setActiveMobileTab] = useState<'roster' | 'availability'>('roster');
    const [staffFilter, setStaffFilter] = useState<string | null>(null);
    const [filterMode, setFilterMode] = useState<'HARD' | 'HIGHLIGHT'>('HARD');

    // Load staff data
    useEffect(() => {
        if (userData?.role === 'ADMIN') {
            loadStaff();
        }
    }, [userData]);

    // Real-time listener for availability (RIGHT SECTION)
    useEffect(() => {
        if (!userData || userData.role !== 'ADMIN') return;

        const weekStart = Timestamp.fromDate(selectedWeek);
        const q = query(
            collection(db, 'availability'),
            where('weekStartDate', '==', weekStart),
            where('status', '==', 'SUBMITTED')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const loadedAvailability: Availability[] = [];
            snapshot.forEach((doc) => {
                loadedAvailability.push({ id: doc.id, ...doc.data() } as Availability);
            });
            setAvailability(loadedAvailability);
        });

        return () => unsubscribe();
    }, [selectedWeek, userData]);

    // Real-time listener for shifts (LEFT SECTION)
    useEffect(() => {
        if (!userData || userData.role !== 'ADMIN') return;

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

        const q = query(
            collection(db, 'shifts'),
            where('date', '>=', Timestamp.fromDate(startDate)),
            where('date', '<', Timestamp.fromDate(endDate)),
            where('status', '==', 'APPROVED')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const loadedShifts: Shift[] = [];
            snapshot.forEach((doc) => {
                loadedShifts.push({ id: doc.id, ...doc.data() } as Shift);
            });
            setShifts(loadedShifts);
        });

        return () => unsubscribe();
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

    const getAvailabilityForDay = () => {
        let filtered = availability;
        if (selectedDay !== -1) {
            filtered = filtered.filter((a) => a.dayOfWeek === selectedDay);
        }
        if (staffFilter) {
            filtered = filtered.filter((a) => a.staffId === staffFilter);
        }
        return filtered;
    };

    const openApprovalModal = (staffId: string, ranges: any[], dayOfWeek?: number) => {
        const staff = staffMap[staffId];
        if (!staff) return;

        setSelectedStaff({ id: staffId, name: staff.name, ranges, dayOfWeek });
        setShiftForm({ startTime: ranges[0]?.start || '09:00', endTime: ranges[0]?.end || '17:00' });
        setIsEditingShift(false);
        setEditingShiftId(null);
        setShowApprovalModal(true);
    };

    const openEditModal = (shift: Shift) => {
        const staff = staffMap[shift.staffId];
        if (!staff) return;

        // Try to find availability for this staff on this day to get time ranges
        const staffAvail = availability.find(a => a.staffId === shift.staffId);
        const ranges = staffAvail?.timeRanges || [{ start: '00:00', end: '23:59' }];

        setSelectedStaff({ id: shift.staffId, name: staff.name, ranges, dayOfWeek: shift.date.toDate().getDay() });
        setShiftForm({ startTime: shift.startTime, endTime: shift.endTime });
        setIsEditingShift(true);
        setEditingShiftId(shift.id!);
        setShowApprovalModal(true);
    };

    const handleSaveShift = async () => {
        if (!selectedStaff || !userData) return;

        // Validate shift times (operating hours)
        if (isTimeBefore(shiftForm.startTime, SHOP_OPEN_TIME) || isTimeBefore(SHOP_CLOSE_TIME, shiftForm.endTime)) {
            showNotification(`Shifts must be between ${SHOP_OPEN_TIME} and ${SHOP_CLOSE_TIME}`, 'error');
            return;
        }

        if (!isTimeBefore(shiftForm.startTime, shiftForm.endTime)) {
            showNotification('Start time must be before end time', 'error');
            return;
        }

        if (!isValidInterval(shiftForm.startTime) || !isValidInterval(shiftForm.endTime)) {
            showNotification('Shift times must be in 15-minute intervals', 'error');
            return;
        }

        // Validate shift is within availability
        if (!isWithinAvailability(shiftForm.startTime, shiftForm.endTime, selectedStaff.ranges)) {
            showNotification('Shift must be within staff availability', 'error');
            return;
        }
        // Determine the target date of the shift we are trying to save
        const targetDate = (() => {
            if (isEditingShift && editingShiftId) {
                const prevShift = shifts.find(s => s.id === editingShiftId);
                return prevShift ? prevShift.date.toDate() : null;
            } else {
                const dayDate = new Date(selectedWeek);
                const shiftDay = selectedStaff.dayOfWeek ?? selectedDay;
                const finalDay = shiftDay === -1 ? new Date().getDay() : shiftDay;
                dayDate.setDate(dayDate.getDate() + (finalDay === 0 ? 6 : finalDay - 1));
                dayDate.setHours(0, 0, 0, 0);
                return dayDate;
            }
        })();

        if (!targetDate) return;
        const targetDateString = targetDate.toDateString();

        // Check for overlapping shifts ONLY on the same day
        const existingShifts = shifts.filter((s) => 
            s.staffId === selectedStaff.id && 
            s.id !== editingShiftId &&
            s.date.toDate().toDateString() === targetDateString
        );
        for (const shift of existingShifts) {
            const shiftStartsBefore = isTimeBefore(shiftForm.startTime, shift.endTime);
            const shiftEndsAfter = isTimeBefore(shift.startTime, shiftForm.endTime);
            if (shiftStartsBefore && shiftEndsAfter) {
                showNotification('Shift overlaps with existing shift for this staff on this day', 'error');
                return;
            }
        }

        try {
            const shiftData = {
                staffId: selectedStaff.id,
                startTime: shiftForm.startTime,
                endTime: shiftForm.endTime,
                updatedAt: Timestamp.now(),
                updatedBy: userData.id
            };

            if (isEditingShift && editingShiftId) {
                const prevShift = shifts.find(s => s.id === editingShiftId);
                await updateDoc(doc(db, 'shifts', editingShiftId), shiftData);
                await logRosterAction(editingShiftId, selectedStaff.id, 'EDIT', prevShift, shiftData);
                showNotification('Shift updated successfully!', 'success');
            } else {
                const newShift = {
                    ...shiftData,
                    date: Timestamp.fromDate(targetDate),
                    status: 'APPROVED' as const,
                    approvedBy: userData.id,
                    approvedAt: Timestamp.now(),
                    createdAt: Timestamp.now(),
                };
                const docRef = await addDoc(collection(db, 'shifts'), newShift);
                // No need to log creation as per requirements (only edits/removals), but could be added.
            }

            setShowApprovalModal(false);
            setSelectedStaff(null);
            setIsEditingShift(false);
            setEditingShiftId(null);
        } catch (error) {
            console.error('Error saving shift:', error);
            showNotification('Failed to save shift. Please try again.', 'error');
        }
    };

    const handleRemoveShift = async (shift: Shift) => {
        if (!window.confirm(`Are you sure you want to remove ${staffMap[shift.staffId]?.name || 'this staff'} from this shift?`)) return;

        try {
            await deleteDoc(doc(db, 'shifts', shift.id!));
            await logRosterAction(shift.id!, shift.staffId, 'REMOVE', shift);
            showNotification('Shift removed successfully', 'success');
        } catch (error) {
            console.error('Error removing shift:', error);
            showNotification('Failed to remove shift', 'error');
        }
    };

    const logRosterAction = async (
        shiftId: string,
        staffId: string,
        action: 'EDIT' | 'REMOVE',
        previousData?: Partial<Shift>,
        newData?: Partial<Shift>
    ) => {
        if (!userData) return;
        try {
            await addDoc(collection(db, 'rosterAuditLogs'), {
                adminId: userData.id,
                shiftId,
                staffId,
                action,
                previousData: previousData || null,
                newData: newData || null,
                timestamp: Timestamp.now(),
            });
        } catch (error) {
            console.error('Error logging roster action:', error);
        }
    };

    const dayAvailability = getAvailabilityForDay();

    return (
        <ProtectedRoute requiredRole="ADMIN">
            <div className="min-h-screen bg-background text-gray-900">
                {/* Header */}
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
                                    <h1 className="text-xl font-bold text-gray-900 tracking-tight">Availability & Roster</h1>
                                </div>
                            </div>
                        </div>
                    </div>
                </header>

                {/* Main Content */}
                <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    {/* Controls Card */}
                    <div className="card-base p-4 sm:p-6 mb-8 border-blue-100 bg-white shadow-sm">
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                            <div className="flex flex-col sm:flex-row items-center gap-4">
                                <div className="flex items-center bg-gray-50 p-1 rounded-xl border border-gray-100 w-full sm:w-auto justify-between sm:justify-start">
                                    <button
                                        onClick={() => changeWeek('prev')}
                                        className="p-2 text-gray-500 hover:text-gray-900 hover:bg-white hover:shadow-sm rounded-lg transition-all"
                                        title="Previous Week"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                                        </svg>
                                    </button>
                                    <div className="px-4 sm:px-6 py-1.5 text-sm font-bold text-gray-900 whitespace-nowrap min-w-[140px] sm:min-w-[180px] text-center">
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
                            </div>

                            <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                                <div className="flex items-center gap-3 flex-1 sm:flex-none min-w-[160px]">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 hidden sm:block">Filter Staff:</label>
                                    <select
                                        value={staffFilter || 'ALL'}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setStaffFilter(val === 'ALL' ? null : val);
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
                                <div className="flex items-center gap-3 flex-1 sm:flex-none min-w-[160px]">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 hidden sm:block">View Day:</label>
                                    <select
                                        value={selectedDay}
                                        onChange={(e) => setSelectedDay(Number(e.target.value))}
                                        className="flex-1 sm:flex-none px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-100 outline-none shadow-sm cursor-pointer"
                                    >
                                        <option value={-1}>All Week</option>
                                        <option value={1}>Monday</option>
                                        <option value={2}>Tuesday</option>
                                        <option value={3}>Wednesday</option>
                                        <option value={4}>Thursday</option>
                                        <option value={5}>Friday</option>
                                        <option value={6}>Saturday</option>
                                        <option value={0}>Sunday</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Two-Section Layout - Desktop/Tablet */}
                    <div className="hidden lg:grid lg:grid-cols-2 gap-8">
                        {/* LEFT SECTION - Roster View */}
                        <div>
                            <div className="flex items-center justify-between mb-4 px-2">
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">
                                    Roster: {selectedDay === -1 ? 'Full Week' : getDayName(selectedDay)}
                                </h3>
                                <span className="px-2 py-0.5 bg-green-50 text-green-700 text-[10px] font-black uppercase tracking-tighter rounded border border-green-100">
                                    Active Roster
                                </span>
                            </div>
                            <div className="space-y-4">
                                {(() => {
                                    // Force hard filter for All Week view
                                    const shouldHardFilter = filterMode === 'HARD' || selectedDay === -1;
                                    const rosterShifts = shouldHardFilter && staffFilter
                                        ? shifts.filter(s => s.staffId === staffFilter)
                                        : shifts;

                                    return rosterShifts.length === 0 ? (
                                        <div className="card-base p-10 text-center bg-gray-50/30 border-dashed">
                                            <p className="text-sm text-gray-400 font-medium italic">No approved shifts for this criteria</p>
                                        </div>
                                    ) : (
                                        rosterShifts.map((shift) => (
                                            <div
                                                key={shift.id}
                                                onClick={() => {
                                                    // Container filtering only triggers when viewing ALL week and no master filter is active
                                                    if (selectedDay === -1) {
                                                        if (!staffFilter) {
                                                            setStaffFilter(shift.staffId);
                                                            setFilterMode('HIGHLIGHT');
                                                        } else if (filterMode === 'HIGHLIGHT' && staffFilter === shift.staffId) {
                                                            setStaffFilter(null);
                                                        }
                                                    }
                                                }}
                                                className={`card-base p-5 group hover:border-blue-200 transition-all cursor-pointer ${staffFilter === shift.staffId ? 'bg-blue-50/50 border-blue-500 ring-2 ring-blue-100' : 'bg-white border-gray-100 shadow-sm'
                                                    }`}
                                            >
                                                <div className="flex justify-between items-center">
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <p className="font-bold text-gray-900 text-base">
                                                                {staffMap[shift.staffId]?.name || 'Unknown Staff'}
                                                            </p>
                                                            {selectedDay === -1 && (
                                                                <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-[10px] font-black uppercase tracking-widest rounded">
                                                                    {getDayName(shift.date.toDate().getDay()).substring(0, 3)}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">
                                                            {formatDate(shift.date.toDate())}
                                                        </p>
                                                        <div className="inline-flex items-center gap-2 bg-blue-50/50 px-3 py-1.5 rounded-lg border border-blue-100 text-xs font-bold text-blue-700 tabular-nums">
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                                                            </svg>
                                                            {shift.startTime} - {shift.endTime}
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-6">
                                                        <div className="text-right hidden sm:block">
                                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Duration</p>
                                                            <p className="text-sm font-black text-gray-900">{calculateHours(shift.startTime, shift.endTime).toFixed(2)}h</p>
                                                        </div>
                                                        <div className="flex gap-1">
                                                            <button
                                                                onClick={() => openEditModal(shift)}
                                                                className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                                                title="Modify Shift"
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                                                    <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                                                                </svg>
                                                            </button>
                                                            <button
                                                                onClick={() => handleRemoveShift(shift)}
                                                                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                                                title="Remove from Roster"
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                                                    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                                                </svg>
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    );
                                })()}
                            </div>
                        </div>

                        {/* RIGHT SECTION - Availability */}
                        <div>
                            <div className="flex items-center justify-between mb-4 px-2">
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">
                                    Availability: {selectedDay === -1 ? 'Full Week' : getDayName(selectedDay)}
                                </h3>
                                <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-black uppercase tracking-tighter rounded border border-blue-100">
                                    Staff Submissions
                                </span>
                            </div>
                            <div className="space-y-4">
                                {dayAvailability.length === 0 ? (
                                    <div className="card-base p-10 text-center bg-gray-50/30 border-dashed">
                                        <p className="text-sm text-gray-400 font-medium italic">
                                            {staffFilter
                                                ? `No availability submitted for ${staffMap[staffFilter]?.name}`
                                                : 'No availability submitted for this period'}
                                        </p>
                                    </div>
                                ) : (
                                    dayAvailability.map((avail) => (
                                        <div
                                            key={avail.id}
                                            className={`card-base p-5 border-l-4 transition-all ${staffFilter === avail.staffId
                                                ? 'bg-blue-50/50 border-blue-500 ring-2 ring-blue-100 border-l-blue-600'
                                                : 'bg-white shadow-sm border-gray-100 border-l-blue-400'
                                                }`}
                                        >
                                            <div className="flex justify-between items-start mb-4">
                                                <div>
                                                    <p className="font-bold text-gray-900 text-base">
                                                        {staffMap[avail.staffId]?.name || 'Unknown Staff'}
                                                    </p>
                                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                                        Employee Availability
                                                    </p>
                                                </div>
                                                {selectedDay === -1 ? (
                                                    <span className="px-2 py-1 bg-blue-50 text-blue-700 text-[10px] font-black uppercase tracking-widest rounded border border-blue-100">
                                                        {getDayName(avail.dayOfWeek)}
                                                    </span>
                                                ) : (
                                                    <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest">
                                                        Requested
                                                    </span>
                                                )}
                                            </div>

                                            <div className="flex flex-wrap gap-2 mb-6">
                                                {avail.timeRanges.map((range, idx) => (
                                                    <span key={idx} className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-600 bg-gray-50 px-2.5 py-1 rounded-md border border-gray-100 tabular-nums">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                                                        {range.start} - {range.end}
                                                    </span>
                                                ))}
                                            </div>

                                            {(() => {
                                                const rosteredForDay = shifts.some(s => {
                                                    const shiftDay = s.date.toDate().getDay();
                                                    return s.staffId === avail.staffId && shiftDay === avail.dayOfWeek;
                                                });

                                                return (
                                                    <button
                                                        onClick={() => openApprovalModal(avail.staffId, avail.timeRanges, avail.dayOfWeek)}
                                                        className={`w-full py-2.5 text-white text-[10px] font-black uppercase tracking-widest rounded-lg transition-all shadow-sm flex items-center justify-center gap-2 ${rosteredForDay
                                                            ? 'bg-green-600 hover:bg-green-700 border-b-2 border-green-800'
                                                            : 'bg-blue-600 hover:bg-blue-700 shadow-blue-100'
                                                            }`}
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                                        </svg>
                                                        {rosteredForDay ? 'Shift Rostered' : 'Approve Draft Shift'}
                                                    </button>
                                                );
                                            })()}
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Mobile/Tablet Layout - Tabbed */}
                    <div className="lg:hidden">
                        <div className="card-base border-blue-100 shadow-sm overflow-hidden">
                            <div className="flex bg-gray-50/50 border-b border-gray-100">
                                <button
                                    onClick={() => setActiveMobileTab('roster')}
                                    className={`flex-1 px-4 py-4 text-[10px] font-black uppercase tracking-widest transition-all ${activeMobileTab === 'roster'
                                        ? 'bg-white text-blue-600 border-b-2 border-blue-600'
                                        : 'text-gray-400 hover:text-gray-600'
                                        }`}
                                >
                                    Roster ({shifts.length})
                                </button>
                                <button
                                    onClick={() => setActiveMobileTab('availability')}
                                    className={`flex-1 px-4 py-4 text-[10px] font-black uppercase tracking-widest transition-all ${activeMobileTab === 'availability'
                                        ? 'bg-white text-blue-600 border-b-2 border-blue-600'
                                        : 'text-gray-400 hover:text-gray-600'
                                        }`}
                                >
                                    Availability ({dayAvailability.length})
                                </button>
                            </div>
                            <div className="p-4 space-y-4 min-h-[400px] bg-white">
                                {activeMobileTab === 'roster' ? (
                                    shifts.length === 0 ? (
                                        <div className="py-20 text-center">
                                            <p className="text-gray-400 text-sm font-medium italic">No approved shifts</p>
                                        </div>
                                    ) : (
                                        shifts.map((shift) => (
                                            <div
                                                key={shift.id}
                                                onClick={() => {
                                                    if (selectedDay === -1 && (!staffFilter || staffFilter === shift.staffId)) {
                                                        setStaffFilter(prev => prev === shift.staffId ? null : shift.staffId);
                                                        setFilterMode('HIGHLIGHT');
                                                    }
                                                }}
                                                className={`p-4 rounded-xl border transition-all cursor-pointer ${staffFilter === shift.staffId ? 'bg-blue-50 border-blue-500 ring-2 ring-blue-100' : 'bg-gray-50 border-gray-100'
                                                    }`}
                                            >
                                                <div className="flex justify-between items-start mb-3">
                                                    <div>
                                                        <p className="font-bold text-gray-900">{staffMap[shift.staffId]?.name || 'Staff'}</p>
                                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                                            {getDayName(shift.date.toDate().getDay())}, {formatDate(shift.date.toDate())}
                                                        </p>
                                                    </div>
                                                    <div className="flex gap-1">
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                openEditModal(shift);
                                                            }}
                                                            className="p-2 bg-white text-gray-400 rounded-lg shadow-sm border border-gray-100"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                                                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                                                            </svg>
                                                        </button>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleRemoveShift(shift);
                                                            }}
                                                            className="p-2 bg-white text-red-400 rounded-lg shadow-sm border border-gray-100"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                                                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <span className={`text-xs font-bold px-2 py-1 rounded border tabular-nums ${staffFilter === shift.staffId ? 'text-blue-700 bg-blue-100 border-blue-200' : 'text-blue-600 bg-white border-blue-100'}`}>
                                                        {shift.startTime} - {shift.endTime}
                                                    </span>
                                                    <span className="text-xs font-black text-gray-900">
                                                        {calculateHours(shift.startTime, shift.endTime).toFixed(2)}h
                                                    </span>
                                                </div>
                                            </div>
                                        ))
                                    )
                                ) : (
                                    dayAvailability.length === 0 ? (
                                        <div className="py-20 text-center">
                                            <p className="text-gray-400 text-sm font-medium italic">
                                                {staffFilter
                                                    ? `No availability for ${staffMap[staffFilter]?.name}`
                                                    : 'No submissions'}
                                            </p>
                                        </div>
                                    ) : (
                                        dayAvailability.map((avail) => (
                                            <div
                                                key={avail.id}
                                                className={`p-4 rounded-xl border-l-4 transition-all ${staffFilter === avail.staffId
                                                    ? 'bg-blue-50 border-blue-500 ring-2 ring-blue-100 border-l-blue-600'
                                                    : 'bg-white border-gray-100 shadow-sm border-l-blue-400'
                                                    }`}
                                            >
                                                <div className="flex justify-between items-start mb-3">
                                                    <div>
                                                        <p className="font-bold text-gray-900">{staffMap[avail.staffId]?.name || 'Staff'}</p>
                                                        <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">
                                                            {getDayName(avail.dayOfWeek)}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex flex-wrap gap-2 mb-4">
                                                    {avail.timeRanges.map((range, idx) => (
                                                        <span key={idx} className="text-[10px] font-bold text-gray-600 bg-gray-50 px-2 py-0.5 rounded border border-gray-100">
                                                            {range.start} - {range.end}
                                                        </span>
                                                    ))}
                                                </div>
                                                {(() => {
                                                    const rosteredForDay = shifts.some(s => {
                                                        const shiftDay = s.date.toDate().getDay();
                                                        return s.staffId === avail.staffId && shiftDay === avail.dayOfWeek;
                                                    });

                                                    return (
                                                        <button
                                                            onClick={() => openApprovalModal(avail.staffId, avail.timeRanges, avail.dayOfWeek)}
                                                            className={`w-full text-white text-[10px] font-black uppercase tracking-widest py-2.5 rounded-lg shadow-sm transition-all ${rosteredForDay ? 'bg-green-600' : 'bg-blue-600'}`}
                                                        >
                                                            {rosteredForDay ? 'Shift Rostered' : 'Approve Shift'}
                                                        </button>
                                                    );
                                                })()}
                                            </div>
                                        ))
                                    )
                                )}
                            </div>
                        </div>
                    </div>
                </main>

                {/* Approval Modal */}
                {showApprovalModal && selectedStaff && (
                    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
                        <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-gray-200 overflow-hidden">
                            <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                                <h3 className="text-lg font-bold text-gray-900 tracking-tight">
                                    {isEditingShift ? '🔧 Modify Shift' : '✅ Approve Shift'}
                                </h3>
                                <button onClick={() => setShowApprovalModal(false)} className="text-gray-400 hover:text-gray-600">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                    </svg>
                                </button>
                            </div>

                            <div className="p-6">
                                <div className="mb-6 flex flex-wrap gap-2">
                                    <div className="px-3 py-1 bg-gray-100 rounded-full text-[10px] font-black uppercase tracking-widest text-gray-600">{selectedStaff.name}</div>
                                    <div className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-[10px] font-black uppercase tracking-widest border border-blue-100">
                                        {getDayName(selectedStaff.dayOfWeek ?? selectedDay)}
                                    </div>
                                </div>

                                <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 mb-8">
                                    <p className="text-[10px] font-black text-blue-700 uppercase tracking-widest mb-2">Requested Availability</p>
                                    <div className="space-y-1">
                                        {selectedStaff.ranges.map((range, idx) => (
                                            <p key={idx} className="text-sm font-bold text-gray-900 tabular-nums">
                                                {range.start} - {range.end}
                                            </p>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-6 mb-8">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                                            Shift Start
                                        </label>
                                        <input
                                            type="time"
                                            value={shiftForm.startTime}
                                            step="900"
                                            onChange={(e) => setShiftForm({ ...shiftForm, startTime: normalizeTo15Minutes(e.target.value) })}
                                            className="input-base"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                                            Shift End
                                        </label>
                                        <input
                                            type="time"
                                            value={shiftForm.endTime}
                                            step="900"
                                            onChange={(e) => setShiftForm({ ...shiftForm, endTime: normalizeTo15Minutes(e.target.value) })}
                                            className="input-base"
                                        />
                                    </div>
                                </div>

                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setShowApprovalModal(false)}
                                        className="btn-secondary flex-1"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleSaveShift}
                                        className="btn-primary flex-1"
                                    >
                                        {isEditingShift ? 'Update Shift' : 'Approve Now'}
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
