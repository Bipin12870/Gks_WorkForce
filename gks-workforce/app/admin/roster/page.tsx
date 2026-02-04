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
} from 'firebase/firestore';
import { Availability, Shift, User } from '@/types';
import { getWeekStart, getDayName, formatDate, isWithinAvailability, isTimeBefore } from '@/lib/utils';
import { useRouter } from 'next/navigation';

export default function AdminRosterPage() {
    const { userData } = useAuth();
    const router = useRouter();
    const [selectedWeek, setSelectedWeek] = useState<Date>(getWeekStart(new Date()));
    const [selectedDay, setSelectedDay] = useState<number>(new Date().getDay());
    const [availability, setAvailability] = useState<Availability[]>([]);
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [staffMap, setStaffMap] = useState<Record<string, User>>({});
    const [showApprovalModal, setShowApprovalModal] = useState(false);
    const [selectedStaff, setSelectedStaff] = useState<{ id: string; name: string; ranges: any[] } | null>(null);
    const [shiftForm, setShiftForm] = useState({ startTime: '09:00', endTime: '17:00' });
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Load staff data
    useEffect(() => {
        loadStaff();
    }, []);

    // Real-time listener for availability (RIGHT SECTION)
    useEffect(() => {
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
    }, [selectedWeek]);

    // Real-time listener for shifts (LEFT SECTION)
    useEffect(() => {
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
        setShowApprovalModal(true);
    };

    const handleApproveShift = async () => {
        if (!selectedStaff || !userData) return;

        setMessage(null);

        // Validate shift times
        if (!isTimeBefore(shiftForm.startTime, shiftForm.endTime)) {
            setMessage({ type: 'error', text: 'Start time must be before end time' });
            return;
        }

        // Validate shift is within availability
        if (!isWithinAvailability(shiftForm.startTime, shiftForm.endTime, selectedStaff.ranges)) {
            setMessage({ type: 'error', text: 'Shift must be within staff availability' });
            return;
        }

        // Check for overlapping shifts
        const existingShifts = shifts.filter((s) => s.staffId === selectedStaff.id);
        for (const shift of existingShifts) {
            const shiftStartsBefore = isTimeBefore(shiftForm.startTime, shift.endTime);
            const shiftEndsAfter = isTimeBefore(shift.startTime, shiftForm.endTime);
            if (shiftStartsBefore && shiftEndsAfter) {
                setMessage({ type: 'error', text: 'Shift overlaps with existing shift for this staff' });
                return;
            }
        }

        try {
            const dayDate = new Date(selectedWeek);
            dayDate.setDate(dayDate.getDate() + (selectedDay === 0 ? 6 : selectedDay - 1));
            dayDate.setHours(0, 0, 0, 0);

            await addDoc(collection(db, 'shifts'), {
                staffId: selectedStaff.id,
                date: Timestamp.fromDate(dayDate),
                startTime: shiftForm.startTime,
                endTime: shiftForm.endTime,
                status: 'APPROVED',
                approvedBy: userData.id,
                approvedAt: Timestamp.now(),
                createdAt: Timestamp.now(),
            });

            setMessage({ type: 'success', text: 'Shift approved successfully!' });
            setShowApprovalModal(false);
            setSelectedStaff(null);
        } catch (error) {
            console.error('Error approving shift:', error);
            setMessage({ type: 'error', text: 'Failed to approve shift. Please try again.' });
        }
    };

    const dayAvailability = getAvailabilityForDay();

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
                            <h1 className="text-2xl font-bold text-gray-900">Staff Availability & Roster</h1>
                            <p className="text-sm text-gray-600">View availability and approve shifts</p>
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

                    {/* Message */}
                    {message && (
                        <div
                            className={`mb-6 px-4 py-3 rounded-lg ${message.type === 'success'
                                    ? 'bg-green-50 border border-green-200 text-green-700'
                                    : 'bg-red-50 border border-red-200 text-red-700'
                                }`}
                        >
                            {message.text}
                        </div>
                    )}

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
                                            className="p-4 bg-green-50 border border-green-200 rounded-lg"
                                        >
                                            <p className="font-semibold text-gray-900">
                                                {staffMap[shift.staffId]?.name || 'Unknown Staff'}
                                            </p>
                                            <p className="text-sm text-gray-600">
                                                {shift.startTime} - {shift.endTime}
                                            </p>
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
                                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition"
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
                                <button className="flex-1 px-4 py-3 text-sm font-medium bg-blue-600 text-white">
                                    Roster View
                                </button>
                                <button className="flex-1 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50">
                                    Availability
                                </button>
                            </div>
                            <div className="p-4 space-y-3">
                                {shifts.length === 0 ? (
                                    <p className="text-gray-500 text-sm">No approved shifts for this day</p>
                                ) : (
                                    shifts.map((shift) => (
                                        <div
                                            key={shift.id}
                                            className="p-4 bg-green-50 border border-green-200 rounded-lg"
                                        >
                                            <p className="font-semibold text-gray-900">
                                                {staffMap[shift.staffId]?.name || 'Unknown Staff'}
                                            </p>
                                            <p className="text-sm text-gray-600">
                                                {shift.startTime} - {shift.endTime}
                                            </p>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </main>

                {/* Approval Modal */}
                {showApprovalModal && selectedStaff && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                        <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
                            <h3 className="text-lg font-semibold text-gray-900 mb-4">Approve Shift</h3>

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
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                                    onClick={handleApproveShift}
                                    className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition"
                                >
                                    Approve Shift
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </ProtectedRoute>
    );
}
