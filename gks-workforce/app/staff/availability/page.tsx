'use client';

import { useState, useEffect } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, addDoc, query, where, getDocs, Timestamp, updateDoc, doc, setDoc, deleteDoc } from 'firebase/firestore';
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
            const weekStartStr = selectedWeek.toISOString().split('T')[0];

            // Use deterministic IDs to prevent duplicates and handle deletions
            const promises = [];

            // We iterate 0-6 to ensure we handle all days in the week
            for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
                const dayId = `${userData.id}_${weekStartStr}_${dayOfWeek}`;
                const docRef = doc(db, 'availability', dayId);
                const dayRanges = availability[dayOfWeek] || [];

                if (dayRanges.length > 0) {
                    // Update or create
                    promises.push(setDoc(docRef, {
                        staffId: userData.id,
                        weekStartDate: weekStart,
                        dayOfWeek,
                        timeRanges: dayRanges,
                        isRecurring,
                        status: 'SUBMITTED',
                        submittedAt: Timestamp.now(),
                        updatedAt: Timestamp.now(),
                        // Only set createdAt if it's a new document? 
                        // Actually setDoc with merge: true is an option, but we want to overwrite timeRanges anyway.
                        createdAt: Timestamp.now(),
                    }));
                } else {
                    // Remove if exists
                    promises.push(deleteDoc(docRef));
                }
            }

            await Promise.all(promises);

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
                                <h1 className="text-xl font-bold text-gray-900 tracking-tight">My Availability</h1>
                            </div>
                        </div>
                    </div>
                </header>

                {/* Main Content */}
                <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    {/* Week Selector */}
                    <div className="card-base p-6 mb-8">
                        <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-6">
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

                            <div className="flex items-center gap-4 w-full md:w-auto">
                                <button
                                    onClick={copyFromLastWeek}
                                    className="flex-1 md:flex-none px-4 py-2 text-xs font-black uppercase tracking-widest text-blue-600 hover:bg-blue-50 rounded-lg border-2 border-blue-100 transition-all active:scale-[0.98]"
                                >
                                    Copy Past Week
                                </button>
                                <label className="flex items-center gap-3 cursor-pointer bg-gray-50/50 px-4 py-2 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors">
                                    <input
                                        type="checkbox"
                                        checked={isRecurring}
                                        onChange={(e) => setIsRecurring(e.target.checked)}
                                        className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 transition-all cursor-pointer"
                                    />
                                    <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">Recurring</span>
                                </label>
                            </div>
                        </div>

                        <div className="p-4 bg-orange-50 border border-orange-100 rounded-xl flex gap-3">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-orange-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                            </svg>
                            <p className="text-xs font-medium text-orange-800 leading-relaxed">
                                Please submit your availability for the selected week. Your availability must fall within operating hours ({SHOP_OPEN_TIME} - {SHOP_CLOSE_TIME}).
                            </p>
                        </div>
                    </div>

                    {/* Days Mapping */}
                    <div className="space-y-6">
                        {[1, 2, 3, 4, 5, 6, 0].map((dayOfWeek) => (
                            <div key={dayOfWeek} className="card-base p-6 hover:border-gray-300 transition-colors group">
                                <div className="flex items-center justify-between mb-6">
                                    <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                                        {getDayName(dayOfWeek)}
                                    </h3>
                                    <button
                                        onClick={() => addTimeRange(dayOfWeek)}
                                        className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-blue-600 hover:bg-blue-50 bg-white border border-blue-100 rounded-lg transition-all"
                                    >
                                        + Add Range
                                    </button>
                                </div>

                                <div className="space-y-4">
                                    {(availability[dayOfWeek] || []).length === 0 ? (
                                        <div className="py-4 text-center border-2 border-dashed border-gray-100 rounded-xl">
                                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">No availability set</p>
                                        </div>
                                    ) : (
                                        (availability[dayOfWeek] || []).map((range, index) => (
                                            <div key={index} className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-3 bg-gray-50/50 rounded-xl border border-gray-100 group-hover:bg-white group-hover:shadow-sm transition-all animate-in fade-in slide-in-from-top-1 duration-200">
                                                <div className="flex items-center gap-2 w-full sm:w-auto">
                                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest w-8">From</span>
                                                    <input
                                                        type="time"
                                                        value={range.start}
                                                        onChange={(e) => updateTimeRange(dayOfWeek, index, 'start', e.target.value)}
                                                        className="flex-1 sm:w-32 px-3 py-1.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-sm font-semibold text-gray-900"
                                                    />
                                                </div>
                                                <div className="flex items-center gap-2 w-full sm:w-auto">
                                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest w-8">To</span>
                                                    <input
                                                        type="time"
                                                        value={range.end}
                                                        onChange={(e) => updateTimeRange(dayOfWeek, index, 'end', e.target.value)}
                                                        className="flex-1 sm:w-32 px-3 py-1.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-sm font-semibold text-gray-900"
                                                    />
                                                </div>
                                                <button
                                                    onClick={() => removeTimeRange(dayOfWeek, index)}
                                                    className="self-end sm:self-auto ml-auto p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                                    title="Remove Range"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                                        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                                    </svg>
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Submit Button */}
                    <div className="mt-12 sticky bottom-8 flex justify-center">
                        <button
                            onClick={handleSubmit}
                            disabled={loading}
                            className={`
                                group relative flex items-center justify-center gap-3 px-10 py-4 
                                rounded-2xl font-black uppercase tracking-[0.2em] text-sm
                                transition-all duration-300 shadow-xl overflow-hidden
                                ${loading
                                    ? 'bg-gray-400 cursor-not-allowed'
                                    : 'bg-blue-600 hover:bg-blue-700 text-white hover:shadow-blue-500/25 hover:-translate-y-1 active:translate-y-0'
                                }
                            `}
                        >
                            <span className="relative z-10">{loading ? 'Submitting...' : 'Confirm Availability'}</span>
                            {!loading && (
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 relative z-10 transition-transform group-hover:translate-x-1" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                                </svg>
                            )}
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
                        </button>
                    </div>
                </main>
            </div>
        </ProtectedRoute>
    );
}
