'use client';

import { useState, useEffect } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, addDoc, query, where, getDocs, Timestamp, updateDoc, doc } from 'firebase/firestore';
import { TimeRange, Availability } from '@/types';
import { getWeekStart, getDayName, formatDate } from '@/lib/utils';
import { useRouter } from 'next/navigation';

export default function StaffAvailabilityPage() {
    const { userData } = useAuth();
    const router = useRouter();
    const [selectedWeek, setSelectedWeek] = useState<Date>(getWeekStart(new Date()));
    const [availability, setAvailability] = useState<Record<number, TimeRange[]>>({});
    const [isRecurring, setIsRecurring] = useState(false);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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
            [dayOfWeek]: [...(availability[dayOfWeek] || []), { start: '09:00', end: '17:00' }],
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
        setMessage({ type: 'success', text: 'Copied availability from last week' });
    };

    const handleSubmit = async () => {
        if (!userData) return;

        setLoading(true);
        setMessage(null);

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

            setMessage({ type: 'success', text: 'Availability submitted successfully!' });
        } catch (error) {
            console.error('Error submitting availability:', error);
            setMessage({ type: 'error', text: 'Failed to submit availability. Please try again.' });
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
                            <div>
                                <button
                                    onClick={() => router.push('/dashboard')}
                                    className="text-blue-600 hover:text-blue-700 text-sm font-medium mb-2"
                                >
                                    ← Back to Dashboard
                                </button>
                                <h1 className="text-2xl font-bold text-gray-900">My Availability</h1>
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
                                                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            />
                                            <span className="text-gray-500">to</span>
                                            <input
                                                type="time"
                                                value={range.end}
                                                onChange={(e) => updateTimeRange(dayOfWeek, index, 'end', e.target.value)}
                                                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            />
                                            <button
                                                onClick={() => removeTimeRange(dayOfWeek, index)}
                                                className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition"
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    ))}

                                    <button
                                        onClick={() => addTimeRange(dayOfWeek)}
                                        className="px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg border border-blue-200 transition"
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
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? 'Submitting...' : 'Submit Availability'}
                        </button>
                    </div>
                </main>
            </div>
        </ProtectedRoute>
    );
}
