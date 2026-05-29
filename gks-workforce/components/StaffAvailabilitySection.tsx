
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
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
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Icon from '@/components/ui/Icon';
import StaffActionFooter from '@/components/staff/StaffActionFooter';
import { ChevronDown, Lock, Plus, Trash2, Copy } from 'lucide-react';

const WEEK_DAYS = [1, 2, 3, 4, 5, 6, 0];

// ─── Draft persistence ────────────────────────────────────────────────────────
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function _formatWeekKey(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function _draftKey(userId: string, weekStart: Date): string {
    return `avail_draft_${userId}_${_formatWeekKey(weekStart)}`;
}

interface _AvailDraft {
    weekStartMs: number;
    availability: Record<number, TimeRange[]>;
    isRecurring: boolean;
    savedAt: number;
}

function _saveDraft(userId: string, weekStart: Date, availability: Record<number, TimeRange[]>, isRecurring: boolean): void {
    try {
        const draft: _AvailDraft = {
            weekStartMs: weekStart.getTime(),
            availability,
            isRecurring,
            savedAt: Date.now(),
        };
        localStorage.setItem(_draftKey(userId, weekStart), JSON.stringify(draft));
    } catch { /* localStorage unavailable — fail silently */ }
}

function _loadDraft(userId: string, weekStart: Date): _AvailDraft | null {
    try {
        const raw = localStorage.getItem(_draftKey(userId, weekStart));
        if (!raw) return null;
        const draft = JSON.parse(raw) as _AvailDraft;
        if (Date.now() - draft.savedAt > DRAFT_TTL_MS) {
            localStorage.removeItem(_draftKey(userId, weekStart));
            return null;
        }
        return draft;
    } catch {
        return null;
    }
}

function _clearDraft(userId: string, weekStart: Date): void {
    try { localStorage.removeItem(_draftKey(userId, weekStart)); } catch { /* fail silently */ }
}
// ──────────────────────────────────────────────────────────────────────────────

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
    // Prevents saving draft during initial Firestore load
    const draftReady = useRef(false);

    const hasLockedDays = lockedDays.size > 0;

    const loadAvailability = useCallback(async () => {
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

            // Merge draft for days that have no submitted Firestore record and aren't locked
            const draft = _loadDraft(userData.id, selectedWeek);
            const finalAvailability = { ...loadedAvailability };
            let finalRecurring = recurring;
            if (draft) {
                for (const [dayStr, ranges] of Object.entries(draft.availability)) {
                    const day = parseInt(dayStr, 10);
                    if (!isNaN(day) && !daysWithShifts.has(day) && !(day in loadedAvailability)) {
                        finalAvailability[day] = ranges;
                    }
                }
                if (!recurring && draft.isRecurring) finalRecurring = draft.isRecurring;
            }

            setAvailability(finalAvailability);
            setIsRecurring(finalRecurring);
            setLockedDays(daysWithShifts);
        } catch (error) {
            console.error('Error loading availability:', error);
            showNotification('Failed to load your availability. Please set it again.', 'error');
        } finally {
            setLoading(false);
            draftReady.current = true;
        }
    }, [selectedWeek, userData, showNotification]);

    useEffect(() => {
        draftReady.current = false; // block saves during reload
        loadAvailability();
    }, [loadAvailability]);

    const isPastDay = useCallback((dayOfWeek: number) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const dayDate = new Date(selectedWeek);
        dayDate.setDate(dayDate.getDate() + (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
        dayDate.setHours(0, 0, 0, 0);

        return dayDate.getTime() < today.getTime();
    }, [selectedWeek]);

    const isToday = useCallback((dayOfWeek: number) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const dayDate = new Date(selectedWeek);
        dayDate.setDate(dayDate.getDate() + (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
        dayDate.setHours(0, 0, 0, 0);

        return dayDate.getTime() === today.getTime();
    }, [selectedWeek]);

    const isDayLocked = useCallback((dayOfWeek: number) => {
        return lockedDays.has(dayOfWeek) || isPastDay(dayOfWeek);
    }, [lockedDays, isPastDay]);

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
        if (!userData || loading) return;
        setLoading(true);
        try {
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
                // Reset all unlocked days first to ensure we overwrite/clear them correctly
                for (let day = 0; day < 7; day++) {
                    if (!isDayLocked(day)) {
                        next[day] = [];
                    }
                }
                for (const [dayStr, ranges] of Object.entries(copiedAvailability)) {
                    const day = parseInt(dayStr, 10);
                    if (!isNaN(day) && !isDayLocked(day)) {
                        next[day] = ranges;
                    }
                }
                return next;
            });
            showNotification('Copied availability from last week (rostered days unchanged)', 'success');
        } catch (error) {
            console.error('Error copying availability:', error);
            showNotification('Failed to copy past week availability', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async () => {
        if (!userData) return;

        setLoading(true);
        try {
            // Client-side validation for immediate UX feedback
            const cleanedAvailability: Record<number, TimeRange[]> = {};

            for (const [dayStr, ranges] of Object.entries(availability)) {
                const dayOfWeek = parseInt(dayStr);
                if (isNaN(dayOfWeek)) continue;

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
            const result = await submitAvailability(selectedWeek.getTime(), cleanedAvailability, isRecurring, new Date().getTimezoneOffset());

            if (result.success) {
                showNotification('Availability submitted successfully!', 'success');
                _clearDraft(userData.id, selectedWeek);
                await loadAvailability();
            } else {
                showNotification(result.error || 'Failed to submit availability. Please try again.', 'error');
            }
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

    // Persist draft on every form change — silently, after initial load
    useEffect(() => {
        if (!draftReady.current || !userData) return;
        _saveDraft(userData.id, selectedWeek, availability, isRecurring);
    }, [availability, isRecurring, selectedWeek, userData]);

    const allDaysLocked = WEEK_DAYS.every((day) => isDayLocked(day));
    const canSubmit = WEEK_DAYS.some((day) => !isDayLocked(day));

    return (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="shrink-0 space-y-4 mb-3">
                <div className="flex justify-center">
                    <div className="w-full max-w-xs">
                        <StaffWeekPicker
                            weekStart={selectedWeek}
                            onPrev={() => changeWeek('prev')}
                            onNext={() => changeWeek('next')}
                        />
                    </div>
                </div>
                {!allDaysLocked && (
                    <div className="flex items-center justify-center gap-8 px-1">
                        {/* Copy past week — demoted to text-link */}
                        <div className="flex flex-col gap-0.5">
                            <button
                                type="button"
                                onClick={copyFromLastWeek}
                                disabled={loading}
                                className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 disabled:opacity-40 transition-colors"
                            >
                                <Icon icon={Copy} size="sm" className="text-gray-400" />
                                Copy past week
                            </button>
                            {hasLockedDays && (
                                <span className="text-[11px] text-gray-400 leading-none pl-[22px]">
                                </span>
                            )}
                        </div>

                        {/* Repeat weekly — iOS-style toggle */}
                        <label className="flex items-center gap-2 cursor-pointer select-none shrink-0">
                            <span className="text-sm font-medium text-gray-600">Repeat weekly</span>
                            <div
                                className={`relative w-9 h-5 rounded-full transition-colors duration-200 ${
                                    isRecurring ? 'bg-blue-600' : 'bg-gray-300'
                                }`}
                            >
                                <input
                                    type="checkbox"
                                    checked={isRecurring}
                                    onChange={(e) => setIsRecurring(e.target.checked)}
                                    className="sr-only"
                                />
                                <span
                                    className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200 ${
                                        isRecurring ? 'translate-x-4' : 'translate-x-0'
                                    }`}
                                />
                            </div>
                        </label>
                    </div>
                )}
            </div>

            <div className="shrink-0 mt-1 mb-4 px-1">
                {hasLockedDays ? (
                    <div className="bg-red-50 border border-red-100 rounded-lg py-2 px-3 flex items-center justify-center gap-2 text-red-700">
                        <Icon icon={Lock} size="sm" className="text-red-500 shrink-0" />
                        <span className="text-[11px] font-medium leading-none">
                            Roster published
                        </span>
                    </div>
                ) : (
                    <p className="text-[11px] text-blue-500 text-center leading-snug">
                        Set between store times.
                    </p>
                )}
            </div>

            <div className="flex-1 overflow-y-auto pr-0.5 pb-[calc(6.75rem+env(safe-area-inset-bottom))]">
                <div className="bg-white divide-y divide-gray-100 overflow-hidden">
                    {WEEK_DAYS.map((dayOfWeek) => {
                        const ranges = availability[dayOfWeek] || [];
                        const isOpen = openDay === dayOfWeek;
                        const todayState = isToday(dayOfWeek);
                        const pastState = isPastDay(dayOfWeek);
                        const isRostered = lockedDays.has(dayOfWeek);
                        const dayLocked = isDayLocked(dayOfWeek);
                        return (
                            <div
                                key={dayOfWeek}
                                className={`transition-all ${todayState
                                        ? 'border-l-4 border-l-blue-600 bg-blue-50/5'
                                        : isRostered
                                            ? 'border-l-4 border-l-amber-500 bg-amber-50/5'
                                            : pastState
                                                ? 'border-l-4 border-l-gray-300 bg-gray-50/30 opacity-80'
                                                : ''
                                    }`}
                            >
                                <button
                                    type="button"
                                    onClick={() => setOpenDay(isOpen ? null : dayOfWeek)}
                                    className={`w-full flex items-center justify-between py-5 pr-4 min-h-11 transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${todayState || pastState || isRostered ? 'pl-3' : 'pl-4'
                                        } ${dayLocked
                                            ? 'bg-transparent text-gray-500'
                                            : 'bg-transparent hover:bg-gray-50/50 text-gray-900'
                                        }`}
                                    aria-expanded={isOpen}
                                >
                                    <span className={`flex items-center gap-1.5 text-sm font-semibold ${dayLocked ? 'text-gray-500' : 'text-gray-900'}`}>
                                        {getDayName(dayOfWeek)}
                                        {todayState && <span className="text-xs text-blue-600 font-semibold">(Today)</span>}
                                        {dayLocked && (
                                            <Lock
                                                className="text-gray-400 shrink-0 w-3.5 h-3.5"
                                                aria-hidden="true"
                                            />
                                        )}
                                    </span>
                                    <div className="flex items-center gap-2">
                                        {ranges.length > 0 && (
                                            <span className={`text-xs ${dayLocked ? 'text-gray-400' : 'text-gray-500'}`}>
                                                {ranges.length} range{ranges.length !== 1 ? 's' : ''}
                                            </span>
                                        )}
                                        <Icon
                                            icon={ChevronDown}
                                            size="sm"
                                            className={`text-gray-500 transition-transform shrink-0 ${isOpen ? 'rotate-180' : ''}`}
                                        />
                                    </div>
                                </button>
                                {isOpen && (
                                    <div className={`p-3.5 sm:p-4 border-t border-gray-100 space-y-4 ${todayState || pastState || isRostered ? 'pl-3 sm:pl-3.5' : ''
                                        }`}>
                                        {!dayLocked && (
                                            <div className="flex justify-center">
                                                <Button variant="ghost-primary" size="sm" onClick={() => addTimeRange(dayOfWeek)}>
                                                    <Icon icon={Plus} size="sm" /> Add range
                                                </Button>
                                            </div>
                                        )}
                                        {ranges.length === 0 ? (
                                            <p className="text-label text-center py-2">No availability set</p>
                                        ) : (
                                            <div className="space-y-2">
                                                {ranges.map((range, index) => {
                                                    const issue = !dayLocked ? rangeHasIssue(range) : null;
                                                    return (
                                                        <div key={index} className="space-y-1.5 min-w-0 w-full">
                                                            <div
                                                                className={`flex items-center gap-2 p-2 border rounded-xl min-w-0 w-full ${dayLocked
                                                                        ? 'bg-gray-100/30 border-gray-200'
                                                                        : 'bg-white border-gray-100 shadow-xs'
                                                                    }`}
                                                            >
                                                                <Input
                                                                    type="time"
                                                                    value={range.start}
                                                                    step="900"
                                                                    onChange={(e) =>
                                                                        updateTimeRange(dayOfWeek, index, 'start', e.target.value)
                                                                    }
                                                                    disabled={dayLocked}
                                                                    className="flex-1 min-w-0 text-center px-2 py-1.5 h-10 min-h-0 text-sm bg-transparent"
                                                                />
                                                                <span className="text-sm text-gray-600 shrink-0 select-none font-semibold">to</span>
                                                                <Input
                                                                    type="time"
                                                                    value={range.end}
                                                                    step="900"
                                                                    onChange={(e) =>
                                                                        updateTimeRange(dayOfWeek, index, 'end', e.target.value)
                                                                    }
                                                                    disabled={dayLocked}
                                                                    className="flex-1 min-w-0 text-center px-2 py-1.5 h-10 min-h-0 text-sm bg-transparent"
                                                                />
                                                                {!dayLocked && (
                                                                    <Button
                                                                        variant="ghost-danger"
                                                                        size="sm"
                                                                        onClick={() => removeTimeRange(dayOfWeek, index)}
                                                                        aria-label="Remove range"
                                                                        className="shrink-0 h-10 w-10 flex items-center justify-center p-0 min-w-0 min-h-0"
                                                                    >
                                                                        <Icon icon={Trash2} size="sm" className="text-red-500" />
                                                                    </Button>
                                                                )}
                                                            </div>
                                                            {issue && (
                                                                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 w-full">
                                                                    {issue}
                                                                </p>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {canSubmit && (
                <StaffActionFooter>
                    <Button variant="primary" size="md" fullWidth onClick={handleSubmit} disabled={loading}>
                        {loading ? 'Submitting...' : 'Submit'}
                    </Button>
                </StaffActionFooter>
            )}
        </div>
    );
}
