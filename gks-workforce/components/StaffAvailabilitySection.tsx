
'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { TimeRange, Availability } from '@/types';
import {
    getWeekStart,
    getDayName,
    SHOP_OPEN_TIME,
    SHOP_CLOSE_TIME,
    isTimeBefore,
    isValidInterval,
    normalizeTo15Minutes,
    incrementTime,
    hasOverlap,
    isWithinShopHours,
} from '@/lib/utils';
import { submitAvailability } from '@/app/actions/availability';
import { useNotification } from '@/contexts/NotificationContext';
import StaffWeekPicker from '@/components/staff/StaffWeekPicker';
import StaffAlert from '@/components/staff/StaffAlert';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Icon from '@/components/ui/Icon';
import StaffActionFooter from '@/components/staff/StaffActionFooter';
import { AlertTriangle, ChevronDown, Info, Plus, Trash2 } from 'lucide-react';

const WEEK_DAYS = [1, 2, 3, 4, 5, 6, 0];

function rangeHasIssue(range: TimeRange): string | null {
    if (!range.start || !range.end) return null;
    if (!isWithinShopHours(range.start) || !isWithinShopHours(range.end)) {
        return `Times must be between ${SHOP_OPEN_TIME} and ${SHOP_CLOSE_TIME}`;
    }
    if (!isTimeBefore(range.start, range.end)) {
        return 'End time must be after start time';
    }
    if (!isValidInterval(range.start) || !isValidInterval(range.end)) {
        return 'Use 15-minute steps (e.g. 9:00, 9:15, 9:30)';
    }
    return null;
}

export default function StaffAvailabilitySection() {
    const { userData } = useAuth();
    const [selectedWeek, setSelectedWeek] = useState<Date>(getWeekStart(new Date()));
    const [availability, setAvailability] = useState<Record<number, TimeRange[]>>({});
    const [isRecurring, setIsRecurring] = useState(false);
    const [loading, setLoading] = useState(false);
    const [lockedDays, setLockedDays] = useState<Set<number>>(new Set());
    const [openDay, setOpenDay] = useState<number | null>(new Date().getDay());
    const { showNotification } = useNotification();

    const hasLockedDays = lockedDays.size > 0;

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
            let recurring = false;

            availSnapshot.forEach((d) => {
                const data = d.data() as Availability;
                if (data.status !== 'SUBMITTED') return;
                loadedAvailability[data.dayOfWeek] = data.timeRanges;
                if (data.isRecurring) recurring = true;
            });

            const daysWithShifts = new Set<number>();
            shiftsSnapshot.forEach((d) => {
                const shift = d.data();
                daysWithShifts.add(shift.date.toDate().getDay());
            });

            setAvailability(loadedAvailability);
            setIsRecurring(recurring);
            setLockedDays(daysWithShifts);
        } catch (error) {
            console.error('Error loading data:', error);
            showNotification('Failed to load availability', 'error');
        } finally {
            setLoading(false);
        }
    };

    const isDayLocked = (dayOfWeek: number) => lockedDays.has(dayOfWeek);

    const addTimeRange = (dayOfWeek: number) => {
        if (isDayLocked(dayOfWeek)) return;

        const existingRanges = availability[dayOfWeek] || [];

        let start = SHOP_OPEN_TIME;
        let end = '17:00';

        if (existingRanges.length > 0) {
            const lastRange = [...existingRanges].sort((a, b) => (isTimeBefore(a.start, b.start) ? -1 : 1))[
                existingRanges.length - 1
            ];
            start = lastRange.end;

            if (start === '24:00' || !isTimeBefore(start, SHOP_CLOSE_TIME)) {
                showNotification('No more space for additional ranges on this day', 'error');
                return;
            }

            end = incrementTime(start, 60);
            if (isTimeBefore(SHOP_CLOSE_TIME, end)) {
                end = SHOP_CLOSE_TIME;
            }
        }

        if (hasOverlap({ start, end }, existingRanges)) {
            showNotification('Cannot add range: conflicts with existing availability', 'error');
            return;
        }

        setAvailability({
            ...availability,
            [dayOfWeek]: [...existingRanges, { start, end }],
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
        if (!value) return;

        if (!isWithinShopHours(value)) {
            showNotification(`Availability must be between ${SHOP_OPEN_TIME} and ${SHOP_CLOSE_TIME}`, 'error');
            return;
        }

        const snapped = normalizeTo15Minutes(value);
        const ranges = [...(availability[dayOfWeek] || [])];
        const updatedRange = { ...ranges[index], [field]: snapped };

        if (snapped !== value) {
            showNotification(`Adjusted to nearest 15 minutes (${snapped})`, 'success');
        }

        if (
            updatedRange.start &&
            updatedRange.end &&
            !isTimeBefore(updatedRange.start, updatedRange.end)
        ) {
            showNotification('End time must be after start time', 'error');
            return;
        }

        if (hasOverlap(updatedRange, ranges, index)) {
            showNotification('Time range conflicts with another availability period on this day', 'error');
            return;
        }

        ranges[index] = updatedRange;
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
            if (data.status !== 'SUBMITTED') return;
            copiedAvailability[data.dayOfWeek] = data.timeRanges;
        });

        setAvailability((prev) => {
            const next = { ...prev };
            for (const [dayStr, ranges] of Object.entries(copiedAvailability)) {
                const day = parseInt(dayStr, 10);
                if (!isNaN(day) && !lockedDays.has(day)) {
                    next[day] = ranges;
                }
            }
            return next;
        });
        showNotification('Copied availability from last week (rostered days unchanged)', 'success');
    };

    const handleSubmit = async () => {
        if (!userData) return;

        setLoading(true);
        try {
            // Client-side validation for immediate UX feedback
            const cleanedAvailability: Record<number, TimeRange[]> = {};

            for (const [dayStr, ranges] of Object.entries(availability)) {
                const dayOfWeek = parseInt(dayStr);
                if (isNaN(dayOfWeek) || isDayLocked(dayOfWeek)) continue;

                const sortedRanges = [...ranges].sort((a, b) =>
                    isTimeBefore(a.start, b.start) ? -1 : 1
                );

                for (const range of sortedRanges) {
                    const issue = rangeHasIssue(range);
                    if (issue) {
                        showNotification(`${getDayName(dayOfWeek)}: ${issue}`, 'error');
                        setLoading(false);
                        return;
                    }
                }

                for (let i = 1; i < sortedRanges.length; i++) {
                    const prev = sortedRanges[i - 1];
                    const curr = sortedRanges[i];
                    if (!isTimeBefore(prev.end, curr.start)) {
                        showNotification(
                            `${getDayName(dayOfWeek)}: ranges overlap or touch. Leave a gap or use one continuous block.`,
                            'error'
                        );
                        setLoading(false);
                        return;
                    }
                }

                cleanedAvailability[dayOfWeek] = sortedRanges;
            }

            // Submit via server action (handles day-lock enforcement, auth, and audit logging)
            await submitAvailability(selectedWeek.getTime(), cleanedAvailability, isRecurring);

            showNotification('Availability submitted successfully!', 'success');
            await loadAvailability();
        } catch (error) {
            console.error('Error submitting availability:', error);
            showNotification((error as Error).message || 'Failed to submit availability. Please try again.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const changeWeek = (direction: 'prev' | 'next') => {
        const newWeek = new Date(selectedWeek);
        newWeek.setDate(newWeek.getDate() + (direction === 'next' ? 7 : -7));
        setSelectedWeek(getWeekStart(newWeek));
    };

    const canSubmit = WEEK_DAYS.some((day) => !isDayLocked(day));

    return (
        <section>
            <div className="space-y-4 mb-4">
                <StaffWeekPicker
                    weekStart={selectedWeek}
                    onPrev={() => changeWeek('prev')}
                    onNext={() => changeWeek('next')}
                />
                <div className="flex flex-wrap gap-2">
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={copyFromLastWeek}
                        disabled={lockedDays.size >= 7}
                    >
                        Copy past week
                    </Button>
                    <label
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm min-h-11 ${
                            hasLockedDays ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-50'
                        }`}
                    >
                        <input
                            type="checkbox"
                            checked={isRecurring}
                            onChange={(e) => setIsRecurring(e.target.checked)}
                            disabled={lockedDays.size >= 7}
                            className="w-4 h-4 text-blue-600 rounded"
                        />
                        <span className="text-label text-gray-700">Recurring (saved for admin reference)</span>
                    </label>
                </div>
            </div>

            {hasLockedDays ? (
                <StaffAlert variant="danger" icon={AlertTriangle} title="Roster published">
                    Days with approved shifts are locked. You can still edit other days in this week.
                </StaffAlert>
            ) : (
                <StaffAlert variant="info" icon={Info} title="Shop hours">
                    Set times between {SHOP_OPEN_TIME} and {SHOP_CLOSE_TIME}. Times snap to the nearest 15 minutes
                    (e.g. 9:03 → 9:00). Fix any warnings before confirming.
                </StaffAlert>
            )}

            <div className="space-y-2 mt-4">
                {WEEK_DAYS.map((dayOfWeek) => {
                    const ranges = availability[dayOfWeek] || [];
                    const isOpen = openDay === dayOfWeek;
                    const dayLocked = isDayLocked(dayOfWeek);
                    return (
                        <div key={dayOfWeek} className="border border-gray-200 rounded-lg overflow-hidden">
                            <button
                                type="button"
                                onClick={() => setOpenDay(isOpen ? null : dayOfWeek)}
                                className="w-full flex items-center justify-between px-4 py-3 min-h-11 bg-gray-50/80 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
                                aria-expanded={isOpen}
                            >
                                <span className="text-section-title">
                                    {getDayName(dayOfWeek)}
                                    {dayLocked && (
                                        <span className="ml-2 text-[10px] font-semibold text-amber-700 uppercase">
                                            Rostered
                                        </span>
                                    )}
                                </span>
                                <div className="flex items-center gap-2">
                                    {ranges.length > 0 && (
                                        <span className="text-label">
                                            {ranges.length} range{ranges.length !== 1 ? 's' : ''}
                                        </span>
                                    )}
                                    <Icon
                                        icon={ChevronDown}
                                        size="sm"
                                        className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}
                                    />
                                </div>
                            </button>
                            {isOpen && (
                                <div className="p-3.5 sm:p-4 space-y-4 border-t border-gray-100">
                                    {!dayLocked && (
                                        <Button variant="ghost-primary" size="sm" onClick={() => addTimeRange(dayOfWeek)}>
                                            <Icon icon={Plus} size="sm" /> Add range
                                        </Button>
                                    )}
                                    {ranges.length === 0 ? (
                                        <p className="text-label text-center py-2">No availability set</p>
                                    ) : (
                                        ranges.map((range, index) => {
                                            const issue = !dayLocked ? rangeHasIssue(range) : null;
                                            return (
                                                <div
                                                    key={index}
                                                    className="flex gap-2.5 sm:gap-3 p-3.5 bg-white border border-gray-100 rounded-xl min-w-0"
                                                >
                                                    <div className="flex-1 min-w-0 space-y-3">
                                                        <div className="min-w-0">
                                                            <label className="text-label block mb-1">From</label>
                                                            <Input
                                                                type="time"
                                                                value={range.start}
                                                                step="900"
                                                                onChange={(e) =>
                                                                    updateTimeRange(dayOfWeek, index, 'start', e.target.value)
                                                                }
                                                                disabled={dayLocked}
                                                                className="w-full min-w-0 px-2"
                                                            />
                                                        </div>
                                                        <div className="min-w-0">
                                                            <label className="text-label block mb-1">To</label>
                                                            <Input
                                                                type="time"
                                                                value={range.end}
                                                                step="900"
                                                                onChange={(e) =>
                                                                    updateTimeRange(dayOfWeek, index, 'end', e.target.value)
                                                                }
                                                                disabled={dayLocked}
                                                                className="w-full min-w-0 px-2"
                                                            />
                                                        </div>
                                                        {issue && (
                                                            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                                                                {issue}
                                                            </p>
                                                        )}
                                                    </div>
                                                    {!dayLocked && (
                                                        <div className="shrink-0 w-11 flex items-center justify-center self-center">
                                                            <Button
                                                                variant="ghost-danger"
                                                                size="sm"
                                                                onClick={() => removeTimeRange(dayOfWeek, index)}
                                                                aria-label="Remove range"
                                                                className="min-w-11 min-h-11"
                                                            >
                                                                <Icon icon={Trash2} size="sm" />
                                                            </Button>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {canSubmit && (
                <StaffActionFooter>
                    <Button variant="primary" size="lg" fullWidth onClick={handleSubmit} disabled={loading}>
                        {loading ? 'Submitting...' : 'Confirm availability'}
                    </Button>
                </StaffActionFooter>
            )}
        </section>
    );
}
