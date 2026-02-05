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
import { getWeekStart, getDayName, formatDate, isWithinAvailability, isTimeBefore, SHOP_OPEN_TIME, SHOP_CLOSE_TIME } from '@/lib/utils';
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
    const [selectedStaff, setSelectedStaff] = useState<{ id: string; name: string; ranges: any[] } | null>(null);
    const [shiftForm, setShiftForm] = useState({ startTime: '09:00', endTime: '17:00' });
    const [isEditingShift, setIsEditingShift] = useState(false);
    const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
    const [activeMobileTab, setActiveMobileTab] = useState<'roster' | 'availability'>('roster');

    // Load staff data
    useEffect(() => {
        loadStaff();
    }, []);

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

        const dayDate = new Date(selectedWeek);
        dayDate.setDate(dayDate.getDate() + (selectedDay === 0 ? 6 : selectedDay - 1));
        dayDate.setHours(0, 0, 0, 0);

        const nextDay = new Date(dayDate);
        nextDay.setDate(nextDay.getDate() + 1);

        const q = query(
            collection(db, 'shifts'),
            where('date', '>=', Timestamp.fromDate(dayDate)),
            where('date', '<', Timestamp.fromDate(nextDay)),
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
    }, [selectedWeek, selectedDay]);

    const loadStaff = async () => {
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
        return availability.filter((a) => a.dayOfWeek === selectedDay);
    };

    const openApprovalModal = (staffId: string, ranges: any[]) => {
        const staff = staffMap[staffId];
        if (!staff) return;

        setSelectedStaff({ id: staffId, name: staff.name, ranges });
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

        setSelectedStaff({ id: shift.staffId, name: staff.name, ranges });
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

        // Validate shift is within availability
        if (!isWithinAvailability(shiftForm.startTime, shiftForm.endTime, selectedStaff.ranges)) {
            showNotification('Shift must be within staff availability', 'error');
            return;
        }

        // Check for overlapping shifts
        const existingShifts = shifts.filter((s) => s.staffId === selectedStaff.id && s.id !== editingShiftId);
        for (const shift of existingShifts) {
            const shiftStartsBefore = isTimeBefore(shiftForm.startTime, shift.endTime);
            const shiftEndsAfter = isTimeBefore(shift.startTime, shiftForm.endTime);
            if (shiftStartsBefore && shiftEndsAfter) {
                showNotification('Shift overlaps with existing shift for this staff', 'error');
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
                const dayDate = new Date(selectedWeek);
                dayDate.setDate(dayDate.getDate() + (selectedDay === 0 ? 6 : selectedDay - 1));
                dayDate.setHours(0, 0, 0, 0);

                const newShift = {
                    ...shiftData,
                    date: Timestamp.fromDate(dayDate),
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
            <div className="min-h-screen bg-gray-50">
                {/* Header */}
                <header className="bg-white shadow-sm border-b">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <Logo width={100} height={35} />
                                <div className="border-l pl-4">
                                    <button
                                        onClick={() => router.push('/dashboard')}
                                        className="text-blue-600 hover:text-blue-700 text-sm font-medium mb-1 block"
                                    >
                                        ← Back
                                    </button>
                                    <h1 className="text-xl font-bold text-gray-900">Availability & Roster</h1>
                                </div>
                            </div>
                        </div>
                    </div>
                </header>

                {/* Main Content */}
                <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    {/* Week Selector */}
                    <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
                        <div className="flex items-center justify-between mb-4">
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

                        {/* Day Selector */}
                        <div className="flex gap-2 overflow-x-auto">
                            {[1, 2, 3, 4, 5, 6, 0].map((day) => (
                                <button
                                    key={day}
                                    onClick={() => setSelectedDay(day)}
                                    className={`px-4 py-2 text-sm font-medium rounded-lg transition whitespace-nowrap ${selectedDay === day
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                        }`}
                                >
                                    {getDayName(day)}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Two-Section Layout - Desktop/Tablet */}
                    <div className="hidden lg:grid lg:grid-cols-2 gap-6">
                        {/* LEFT SECTION - Roster View (Read-only) */}
                        <div className="bg-white rounded-xl shadow-sm border">
                            <div className="p-6 border-b">
                                <h3 className="text-lg font-semibold text-gray-900">
                                    Roster View - {getDayName(selectedDay)}
                                </h3>
                                <p className="text-sm text-gray-600">Approved shifts (read-only)</p>
                            </div>
                            <div className="p-6 space-y-3 max-h-[600px] overflow-y-auto">
                                {shifts.length === 0 ? (
                                    <p className="text-gray-500 text-sm">No approved shifts for this day</p>
                                ) : (
                                    shifts.map((shift) => (
                                        <div
                                            key={shift.id}
                                            className="p-4 bg-green-50 border border-green-200 rounded-lg flex justify-between items-start"
                                        >
                                            <div>
                                                <p className="font-semibold text-gray-900">
                                                    {staffMap[shift.staffId]?.name || 'Unknown Staff'}
                                                </p>
                                                <p className="text-sm text-gray-600">
                                                    {shift.startTime} - {shift.endTime}
                                                </p>
                                            </div>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => openEditModal(shift)}
                                                    className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-md transition"
                                                    title="Edit Shift"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                                        <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                                                    </svg>
                                                </button>
                                                <button
                                                    onClick={() => handleRemoveShift(shift)}
                                                    className="p-1.5 text-red-600 hover:bg-red-100 rounded-md transition"
                                                    title="Remove Staff"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                                        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* RIGHT SECTION - Availability & Approval (Interactive) */}
                        <div className="bg-white rounded-xl shadow-sm border">
                            <div className="p-6 border-b">
                                <h3 className="text-lg font-semibold text-gray-900">
                                    Availability & Approval - {getDayName(selectedDay)}
                                </h3>
                                <p className="text-sm text-gray-600">Select staff to approve shifts</p>
                            </div>
                            <div className="p-6 space-y-3 max-h-[600px] overflow-y-auto">
                                {dayAvailability.length === 0 ? (
                                    <p className="text-gray-500 text-sm">No availability submitted for this day</p>
                                ) : (
                                    dayAvailability.map((avail) => (
                                        <div
                                            key={avail.id}
                                            className="p-4 bg-blue-50 border border-blue-200 rounded-lg"
                                        >
                                            <p className="font-semibold text-gray-900 mb-2">
                                                {staffMap[avail.staffId]?.name || 'Unknown Staff'}
                                            </p>
                                            <div className="space-y-1 mb-3">
                                                {avail.timeRanges.map((range, idx) => (
                                                    <p key={idx} className="text-sm text-gray-600">
                                                        Available: {range.start} - {range.end}
                                                    </p>
                                                ))}
                                            </div>
                                            <button
                                                onClick={() => openApprovalModal(avail.staffId, avail.timeRanges)}
                                                className="btn-primary py-2 text-sm w-auto"
                                            >
                                                Approve Shift
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Mobile/Tablet Layout - Tabbed */}
                    <div className="lg:hidden">
                        <div className="bg-white rounded-xl shadow-sm border">
                            <div className="flex border-b">
                                <button
                                    onClick={() => setActiveMobileTab('roster')}
                                    className={`flex-1 px-4 py-3 text-sm font-medium transition ${activeMobileTab === 'roster'
                                        ? 'bg-blue-600 text-white'
                                        : 'text-gray-700 hover:bg-gray-50'
                                        }`}
                                >
                                    Roster View
                                </button>
                                <button
                                    onClick={() => setActiveMobileTab('availability')}
                                    className={`flex-1 px-4 py-3 text-sm font-medium transition ${activeMobileTab === 'availability'
                                        ? 'bg-blue-600 text-white'
                                        : 'text-gray-700 hover:bg-gray-50'
                                        }`}
                                >
                                    Availability
                                </button>
                            </div>
                            <div className="p-4 space-y-3">
                                {activeMobileTab === 'roster' ? (
                                    <>
                                        <div className="flex justify-between items-center mb-2">
                                            <h4 className="text-sm font-semibold text-gray-900">Roster View</h4>
                                            <span className="text-xs text-gray-500">Approved shifts</span>
                                        </div>
                                        {shifts.length === 0 ? (
                                            <p className="text-gray-500 text-sm">No approved shifts for this day</p>
                                        ) : (
                                            shifts.map((shift) => (
                                                <div
                                                    key={shift.id}
                                                    className="p-4 bg-green-50 border border-green-200 rounded-lg flex justify-between items-start"
                                                >
                                                    <div>
                                                        <p className="font-semibold text-gray-900">
                                                            {staffMap[shift.staffId]?.name || 'Unknown Staff'}
                                                        </p>
                                                        <p className="text-sm text-gray-600">
                                                            {shift.startTime} - {shift.endTime}
                                                        </p>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => openEditModal(shift)}
                                                            className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-md transition"
                                                            title="Edit Shift"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                                                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                                                            </svg>
                                                        </button>
                                                        <button
                                                            onClick={() => handleRemoveShift(shift)}
                                                            className="p-1.5 text-red-600 hover:bg-red-100 rounded-md transition"
                                                            title="Remove Staff"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                                                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </>
                                ) : (
                                    <>
                                        <div className="flex justify-between items-center mb-2">
                                            <h4 className="text-sm font-semibold text-gray-900">Availability & Approval</h4>
                                            <span className="text-xs text-gray-500">Submitted availability</span>
                                        </div>
                                        {dayAvailability.length === 0 ? (
                                            <p className="text-gray-500 text-sm">No availability submitted for this day</p>
                                        ) : (
                                            dayAvailability.map((avail) => (
                                                <div
                                                    key={avail.id}
                                                    className="p-4 bg-blue-50 border border-blue-200 rounded-lg"
                                                >
                                                    <p className="font-semibold text-gray-900 mb-2">
                                                        {staffMap[avail.staffId]?.name || 'Unknown Staff'}
                                                    </p>
                                                    <div className="space-y-1 mb-3">
                                                        {avail.timeRanges.map((range, idx) => (
                                                            <p key={idx} className="text-sm text-gray-600">
                                                                Available: {range.start} - {range.end}
                                                            </p>
                                                        ))}
                                                    </div>
                                                    <button
                                                        onClick={() => openApprovalModal(avail.staffId, avail.timeRanges)}
                                                        className="btn-primary py-2 text-sm w-full"
                                                    >
                                                        Approve Shift
                                                    </button>
                                                </div>
                                            ))
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </main>

                {/* Approval Modal */}
                {showApprovalModal && selectedStaff && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                        <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
                            <h3 className="text-lg font-semibold text-gray-900 mb-4">
                                {isEditingShift ? 'Edit Shift' : 'Approve Shift'}
                            </h3>

                            <div className="mb-4">
                                <p className="text-sm text-gray-600 mb-2">Staff: {selectedStaff.name}</p>
                                <p className="text-sm text-gray-600 mb-2">Day: {getDayName(selectedDay)}</p>
                                <div className="text-sm text-gray-600">
                                    <p className="font-medium mb-1">Available times:</p>
                                    {selectedStaff.ranges.map((range, idx) => (
                                        <p key={idx}>• {range.start} - {range.end}</p>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-4 mb-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Shift Start Time
                                    </label>
                                    <input
                                        type="time"
                                        value={shiftForm.startTime}
                                        onChange={(e) => setShiftForm({ ...shiftForm, startTime: e.target.value })}
                                        className="input-base py-2"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Shift End Time
                                    </label>
                                    <input
                                        type="time"
                                        value={shiftForm.endTime}
                                        onChange={(e) => setShiftForm({ ...shiftForm, endTime: e.target.value })}
                                        className="input-base py-2"
                                    />
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => {
                                        setShowApprovalModal(false);
                                        setSelectedStaff(null);
                                    }}
                                    className="flex-1 px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg border border-gray-300 transition"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSaveShift}
                                    className="btn-primary flex-1"
                                >
                                    {isEditingShift ? 'Update Shift' : 'Approve Shift'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </ProtectedRoute>
    );
}
