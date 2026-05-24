
'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, Timestamp, setDoc, deleteDoc, doc } from 'firebase/firestore';
import { TimeRange, Availability } from '@/types';
import { getWeekStart, getDayName, SHOP_OPEN_TIME, SHOP_CLOSE_TIME, isTimeBefore, isValidInterval } from '@/lib/utils';
import { useNotification } from '@/contexts/NotificationContext';
import StaffWeekPicker from '@/components/staff/StaffWeekPicker';
import StaffAlert from '@/components/staff/StaffAlert';
import Button from '@/components/ui/Button';
import Icon from '@/components/ui/Icon';
import TimePicker from '@/components/ui/TimePicker';
import StaffActionFooter from '@/components/staff/StaffActionFooter';
import { AlertTriangle, ChevronDown, Info, Plus, Trash2 } from 'lucide-react';

const WEEK_DAYS = [1, 2, 3, 4, 5, 6, 0];

export default function StaffAvailabilitySection() {
    const { userData } = useAuth();
    const [selectedWeek, setSelectedWeek] = useState<Date>(getWeekStart(new Date()));
    const [availability, setAvailability] = useState<Record<number, TimeRange[]>>({});
    const [isRecurring, setIsRecurring] = useState(false);
    const [loading, setLoading] = useState(false);
    const [isRostered, setIsRostered] = useState(false);
    const [openDay, setOpenDay] = useState<number | null>(new Date().getDay());
    const { showNotification } = useNotification();

    useEffect(() => {
        loadAvailability();
    }, [selectedWeek, userData]);

    const loadAvailability = async () => {
        if (!userData) return;
        setLoading(true);

        try {
            const weekStart = Timestamp.fromDate(selectedWeek);
            const nextWeek = new Date(selectedWeek);
            nextWeek.setDate(nextWeek.getDate() + 7);
            const nextWeekStart = Timestamp.fromDate(nextWeek);

            const availQuery = query(
                collection(db, 'availability'),
                where('staffId', '==', userData.id),
                where('weekStartDate', '==', weekStart)
            );

            const shiftsQuery = query(
                collection(db, 'shifts'),
                where('staffId', '==', userData.id),
                where('date', '>=', weekStart),
                where('date', '<', nextWeekStart),
                where('status', '==', 'APPROVED')
            );

            const [availSnapshot, shiftsSnapshot] = await Promise.all([
                getDocs(availQuery),
                getDocs(shiftsQuery),
            ]);

            const loadedAvailability: Record<number, TimeRange[]> = {};
            availSnapshot.forEach((d) => {
                const data = d.data() as Availability;
                loadedAvailability[data.dayOfWeek] = data.timeRanges;
            });

            setAvailability(loadedAvailability);
            setIsRostered(!shiftsSnapshot.empty);
        } catch (error) {
            console.error('Error loading data:', error);
            showNotification('Failed to load availability', 'error');
        } finally {
            setLoading(false);
        }
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

        snapshot.forEach((d) => {
            const data = d.data() as Availability;
            copiedAvailability[data.dayOfWeek] = data.timeRanges;
        });

        setAvailability(copiedAvailability);
        showNotification('Copied availability from last week', 'success');
    };

    const handleSubmit = async () => {
        if (!userData) return;

        for (const ranges of Object.values(availability)) {
            for (const range of ranges) {
                if (isTimeBefore(range.start, SHOP_OPEN_TIME) || isTimeBefore(SHOP_CLOSE_TIME, range.end)) {
                    showNotification(`Availability must be between ${SHOP_OPEN_TIME} and ${SHOP_CLOSE_TIME}`, 'error');
                    return;
                }
                if (!isTimeBefore(range.start, range.end)) {
                    showNotification('Start time must be before end time', 'error');
                    return;
                }
                if (!isValidInterval(range.start) || !isValidInterval(range.end)) {
                    showNotification('Times must be in 15-minute intervals (e.g., :00, :15, :30, :45)', 'error');
                    return;
                }
            }
        }

        setLoading(true);

        try {
            const weekStart = Timestamp.fromDate(selectedWeek);
            const weekStartStr = selectedWeek.toISOString().split('T')[0];
            const promises = [];

            for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
                const dayId = `${userData.id}_${weekStartStr}_${dayOfWeek}`;
                const docRef = doc(db, 'availability', dayId);
                const dayRanges = availability[dayOfWeek] || [];

                if (dayRanges.length > 0) {
                    promises.push(
                        setDoc(docRef, {
                            staffId: userData.id,
                            weekStartDate: weekStart,
                            dayOfWeek,
                            timeRanges: dayRanges,
                            isRecurring,
                            status: 'SUBMITTED',
                            submittedAt: Timestamp.now(),
                            updatedAt: Timestamp.now(),
                            createdAt: Timestamp.now(),
                        })
                    );
                } else {
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
        <section>
            <div className="space-y-4 mb-4">
                <StaffWeekPicker
                    weekStart={selectedWeek}
                    onPrev={() => changeWeek('prev')}
                    onNext={() => changeWeek('next')}
                />
                <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" size="sm" onClick={copyFromLastWeek} disabled={isRostered}>
                        Copy past week
                    </Button>
                    <label
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm min-h-11 ${
                            isRostered ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-50'
                        }`}
                    >
                        <input
                            type="checkbox"
                            checked={isRecurring}
                            onChange={(e) => setIsRecurring(e.target.checked)}
                            disabled={isRostered}
                            className="w-4 h-4 text-blue-600 rounded"
                        />
                        <span className="text-label text-gray-700">Recurring</span>
                    </label>
                </div>
            </div>

            {isRostered ? (
                <StaffAlert variant="danger" icon={AlertTriangle} title="Roster published">
                    Shifts are scheduled for this week. Contact management to change availability.
                </StaffAlert>
            ) : (
                <StaffAlert variant="info" icon={Info} title="Shop hours">
                    Set times between {SHOP_OPEN_TIME} and {SHOP_CLOSE_TIME}.
                </StaffAlert>
            )}

            <div className="space-y-2 mt-4">
                {WEEK_DAYS.map((dayOfWeek) => {
                    const ranges = availability[dayOfWeek] || [];
                    const isOpen = openDay === dayOfWeek;
                    return (
                        <div key={dayOfWeek} className="border border-gray-200 rounded-lg overflow-hidden">
                            <button
                                type="button"
                                onClick={() => setOpenDay(isOpen ? null : dayOfWeek)}
                                className="w-full flex items-center justify-between px-4 py-3 min-h-11 bg-gray-50/80 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
                                aria-expanded={isOpen}
                            >
                                <span className="text-section-title">{getDayName(dayOfWeek)}</span>
                                <div className="flex items-center gap-2">
                                    {ranges.length > 0 && (
                                        <span className="text-label">{ranges.length} range{ranges.length !== 1 ? 's' : ''}</span>
                                    )}
                                    <Icon icon={ChevronDown} size="sm" className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                                </div>
                            </button>
                            {isOpen && (
                                <div className="p-4 space-y-3 border-t border-gray-100">
                                    {!isRostered && (
                                        <Button variant="ghost-primary" size="sm" onClick={() => addTimeRange(dayOfWeek)}>
                                            <Icon icon={Plus} size="sm" /> Add range
                                        </Button>
                                    )}
                                    {ranges.length === 0 ? (
                                        <p className="text-label text-center py-2">No availability set</p>
                                    ) : (
                                        ranges.map((range, index) => (
                                            <div key={index} className="flex flex-col gap-2 sm:flex-row sm:items-end">
                                                <div className="w-full sm:flex-1">
                                                    <label className="text-label block mb-1">From</label>
                                                    <TimePicker
                                                        value={range.start}
                                                        onChange={(val) => updateTimeRange(dayOfWeek, index, 'start', val)}
                                                        disabled={isRostered}
                                                    />
                                                </div>
                                                <div className="w-full sm:flex-1">
                                                    <label className="text-label block mb-1">To</label>
                                                    <TimePicker
                                                        value={range.end}
                                                        onChange={(val) => updateTimeRange(dayOfWeek, index, 'end', val)}
                                                        disabled={isRostered}
                                                    />
                                                </div>
                                                {!isRostered && (
                                                    <Button
                                                        variant="ghost-danger"
                                                        size="sm"
                                                        onClick={() => removeTimeRange(dayOfWeek, index)}
                                                        aria-label="Remove range"
                                                        className="min-w-11"
                                                    >
                                                        <Icon icon={Trash2} size="sm" />
                                                    </Button>
                                                )}
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {!isRostered && (
                <StaffActionFooter>
                    <Button variant="primary" size="lg" fullWidth onClick={handleSubmit} disabled={loading}>
                        {loading ? 'Submitting...' : 'Confirm availability'}
                    </Button>
                </StaffActionFooter>
            )}
        </section>
    );
}
