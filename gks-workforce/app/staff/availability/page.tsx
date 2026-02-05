'use client';

import { useState, useEffect } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, addDoc, query, where, getDocs, Timestamp, updateDoc, doc } from 'firebase/firestore';
import { TimeRange, Availability } from '@/types';
import { getWeekStart, getDayName, formatDate, SHOP_OPEN_TIME, SHOP_CLOSE_TIME, isTimeBefore } from '@/lib/utils';
import { useNotification } from '@/contexts/NotificationContext';
import { useRouter } from 'next/navigation';
import Logo from '@/components/Logo';

export default function StaffAvailabilityPage() {
    const { userData } = useAuth();
    const router = useRouter();
    const [selectedWeek, setSelectedWeek] = useState<Date>(getWeekStart(new Date()));
    const [availability, setAvailability] = useState<Record<number, TimeRange[]>>({});
    const [isRecurring, setIsRecurring] = useState(false);
    const [loading, setLoading] = useState(false);
    const { showNotification } = useNotification();

    // Load existing availability for the week
    useEffect(() => {
        loadAvailability();
    }, [selectedWeek, userData]);

    const loadAvailability = async () => {
        if (!userData) return;

        const weekStart = Timestamp.fromDate(selectedWeek);
        const q = query(
            collection(db, 'availability'),
            where('staffId', '==', userData.id),
            where('weekStartDate', '==', weekStart)
        );

        const snapshot = await getDocs(q);
        const loadedAvailability: Record<number, TimeRange[]> = {};

        snapshot.forEach((doc) => {
            const data = doc.data() as Availability;
            loadedAvailability[data.dayOfWeek] = data.timeRanges;
        });

        setAvailability(loadedAvailability);
    };

    const addTimeRange = (dayOfWeek: number) => {
        setAvailability({
            ...availability,
            [dayOfWeek]: [...(availability[dayOfWeek] || []), { start: SHOP_OPEN_TIME, end: '17:00' }],
        });
    };

    const removeTimeRange = (dayOfWeek: number, index: number) => {
        const ranges = [...(availability[dayOfWeek] || [])];
        ranges.splice(index, 1);
        setAvailability({
            ...availability,
            [dayOfWeek]: ranges,
        });
    };

    const updateTimeRange = (dayOfWeek: number, index: number, field: 'start' | 'end', value: string) => {
        const ranges = [...(availability[dayOfWeek] || [])];
        ranges[index][field] = value;
        setAvailability({
            ...availability,
            [dayOfWeek]: ranges,
        });
    };

    const copyFromLastWeek = async () => {
        if (!userData) return;

        const lastWeek = new Date(selectedWeek);
        lastWeek.setDate(lastWeek.getDate() - 7);
        const lastWeekStart = Timestamp.fromDate(getWeekStart(lastWeek));

        const q = query(
            collection(db, 'availability'),
            where('staffId', '==', userData.id),
            where('weekStartDate', '==', lastWeekStart)
        );

        const snapshot = await getDocs(q);
        const copiedAvailability: Record<number, TimeRange[]> = {};

        snapshot.forEach((doc) => {
            const data = doc.data() as Availability;
            copiedAvailability[data.dayOfWeek] = data.timeRanges;
        });

        setAvailability(copiedAvailability);
        showNotification('Copied availability from last week', 'success');
    };

    const handleSubmit = async () => {
        if (!userData) return;

        // Validate operating hours
        for (const [day, ranges] of Object.entries(availability)) {
            for (const range of ranges) {
                if (isTimeBefore(range.start, SHOP_OPEN_TIME) || isTimeBefore(SHOP_CLOSE_TIME, range.end)) {
                    showNotification(`Availability must be between ${SHOP_OPEN_TIME} and ${SHOP_CLOSE_TIME}`, 'error');
                    return;
                }
                if (!isTimeBefore(range.start, range.end)) {
                    showNotification('Start time must be before end time', 'error');
                    return;
                }
            }
        }

        setLoading(true);

        try {
            const weekStart = Timestamp.fromDate(selectedWeek);

            // Delete existing availability for this week
            const q = query(
                collection(db, 'availability'),
                where('staffId', '==', userData.id),
                where('weekStartDate', '==', weekStart)
            );
            const snapshot = await getDocs(q);
            const deletePromises = snapshot.docs.map((d) => updateDoc(doc(db, 'availability', d.id), { status: 'SUBMITTED' }));
            await Promise.all(deletePromises);

            // Add new availability
            const addPromises = Object.entries(availability).map(([dayOfWeek, timeRanges]) => {
                if (timeRanges.length === 0) return Promise.resolve();

                return addDoc(collection(db, 'availability'), {
                    staffId: userData.id,
                    weekStartDate: weekStart,
                    dayOfWeek: parseInt(dayOfWeek),
                    timeRanges,
                    isRecurring,
                    status: 'SUBMITTED',
                    submittedAt: Timestamp.now(),
                    createdAt: Timestamp.now(),
                    updatedAt: Timestamp.now(),
                });
            });

            await Promise.all(addPromises);

            showNotification('Availability submitted successfully!', 'success');
        } catch (error) {
            console.error('Error submitting availability:', error);
            showNotification('Failed to submit availability. Please try again.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const changeWeek = (direction: 'prev' | 'next') => {
        const newWeek = new Date(selectedWeek);
        newWeek.setDate(newWeek.getDate() + (direction === 'next' ? 7 : -7));
        setSelectedWeek(getWeekStart(newWeek));
    };

    return (
        <ProtectedRoute requiredRole="STAFF">
            <div className="min-h-screen bg-gray-50">
                {/* Header */}
                <header className="bg-white shadow-sm border-b">
                    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
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
                                    <h1 className="text-xl font-bold text-gray-900">My Availability</h1>
                                </div>
                            </div>
                        </div>
                    </div>
                </header>

                {/* Main Content */}
                <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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

                        <div className="flex gap-4">
                            <button
                                onClick={copyFromLastWeek}
                                className="px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg border border-blue-200 transition"
                            >
                                Copy from Last Week
                            </button>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={isRecurring}
                                    onChange={(e) => setIsRecurring(e.target.checked)}
                                    className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                                />
                                <span className="text-sm text-gray-700">Set as recurring</span>
                            </label>
                        </div>
                    </div>

                    {/* Days */}

                    {/* Days */}
                    <div className="space-y-4">
                        {[1, 2, 3, 4, 5, 6, 0].map((dayOfWeek) => (
                            <div key={dayOfWeek} className="bg-white rounded-xl shadow-sm border p-6">
                                <h3 className="text-lg font-semibold text-gray-900 mb-4">{getDayName(dayOfWeek)}</h3>

                                <div className="space-y-3">
                                    {(availability[dayOfWeek] || []).map((range, index) => (
                                        <div key={index} className="flex items-center gap-3">
                                            <input
                                                type="time"
                                                value={range.start}
                                                onChange={(e) => updateTimeRange(dayOfWeek, index, 'start', e.target.value)}
                                                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
                                            />
                                            <span className="text-gray-500">to</span>
                                            <input
                                                type="time"
                                                value={range.end}
                                                onChange={(e) => updateTimeRange(dayOfWeek, index, 'end', e.target.value)}
                                                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
                                            />
                                            <button
                                                onClick={() => removeTimeRange(dayOfWeek, index)}
                                                className="btn-ghost-danger"
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    ))}

                                    <button
                                        onClick={() => addTimeRange(dayOfWeek)}
                                        className="btn-ghost-primary border border-blue-200"
                                    >
                                        + Add Time Range
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Submit Button */}
                    <div className="mt-8">
                        <button
                            onClick={handleSubmit}
                            disabled={loading}
                            className="btn-primary py-4 text-lg"
                        >
                            {loading ? 'Submitting...' : 'Submit Availability'}
                        </button>
                    </div>
                </main>
            </div>
        </ProtectedRoute>
    );
}
