
'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, Timestamp, setDoc, deleteDoc, doc } from 'firebase/firestore';
import { TimeRange, Availability } from '@/types';
import { getWeekStart, getDayName, SHOP_OPEN_TIME, SHOP_CLOSE_TIME, isTimeBefore, isValidInterval, normalizeTo15Minutes, incrementTime, decrementTime, hasOverlap, isWithinShopHours } from '@/lib/utils';
import { useNotification } from '@/contexts/NotificationContext';
import StaffWeekPicker from '@/components/staff/StaffWeekPicker';
import StaffAlert from '@/components/staff/StaffAlert';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Icon from '@/components/ui/Icon';
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
        const existingRanges = availability[dayOfWeek] || [];
        
        // Find the first available gap of at least 1 hour
        let start = SHOP_OPEN_TIME;
        let end = '17:00';
        
        // If there are existing ranges, try to find a gap after the last one
        if (existingRanges.length > 0) {
            const lastRange = [...existingRanges].sort((a, b) => isTimeBefore(a.start, b.start) ? -1 : 1)[existingRanges.length - 1];
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

        // Final check for overlap just in case
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
        const ranges = [...(availability[dayOfWeek] || [])];
        const normalizedValue = normalizeTo15Minutes(value);
        
        // Enforce store hours (09:00-21:00)
        if (!isWithinShopHours(normalizedValue)) {
            showNotification(`Availability must be between ${SHOP_OPEN_TIME} and ${SHOP_CLOSE_TIME}`, 'error');
            return;
        }

        // Create a new object for the updated range to avoid mutation glitches
        const updatedRange = { ...ranges[index], [field]: normalizedValue };
        
        // Auto-correct: Ensure end is always after start
        if (field === 'start' && !isTimeBefore(normalizedValue, updatedRange.end)) {
            updatedRange.end = normalizedValue === SHOP_CLOSE_TIME ? SHOP_CLOSE_TIME : normalizeTo15Minutes(incrementTime(normalizedValue, 15));
        } else if (field === 'end' && !isTimeBefore(updatedRange.start, normalizedValue)) {
            updatedRange.start = normalizedValue === SHOP_OPEN_TIME ? SHOP_OPEN_TIME : normalizeTo15Minutes(decrementTime(normalizedValue, 15));
        }

        // Overlap Check: Ensure this change doesn't conflict with OTHER ranges on the same day
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
            copiedAvailability[data.dayOfWeek] = data.timeRanges;
        });

        setAvailability(copiedAvailability);
        showNotification('Copied availability from last week', 'success');
    };

    const handleSubmit = async () => {
        if (!userData) return;

        setLoading(true);
        try {
            // Clean up and validate ranges
            const cleanedAvailability: Record<number, TimeRange[]> = {};

            for (const [dayStr, ranges] of Object.entries(availability)) {
                const dayOfWeek = parseInt(dayStr);
                if (isNaN(dayOfWeek)) continue;

                // Sort ranges by start time
                const sortedRanges = [...ranges].sort((a, b) => {
                    if (a.start === b.start) return 0;
                    return isTimeBefore(a.start, b.start) ? -1 : 1;
                });

                const mergedRanges: TimeRange[] = [];
                for (const range of sortedRanges) {
                     // Basic validation
                     if (!isTimeBefore(range.start, range.end)) {
                         continue; // Skip invalid ranges
                     }
                     
                     // Enforce 15-minute intervals
                     if (!isValidInterval(range.start) || !isValidInterval(range.end)) {
                         showNotification('Availability times must be in 15-minute intervals', 'error');
                         setLoading(false);
                         return;
                     }

                    if (mergedRanges.length === 0) {
                        mergedRanges.push({ ...range });
                    } else {
                        const lastRange = mergedRanges[mergedRanges.length - 1];
                        // If current range starts before or at last range's end, they overlap
                        if (!isTimeBefore(lastRange.end, range.start)) {
                            // Merge by taking the later end time
                            if (isTimeBefore(lastRange.end, range.end)) {
                                lastRange.end = range.end;
                            }
                        } else {
                            mergedRanges.push({ ...range });
                        }
                    }
                }
                cleanedAvailability[dayOfWeek] = mergedRanges;
            }

            const weekStart = Timestamp.fromDate(selectedWeek);
            const weekStartStr = selectedWeek.toISOString().split('T')[0];
            const promises = [];

            for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
                const dayId = `${userData.id}_${weekStartStr}_${dayOfWeek}`;
                const docRef = doc(db, 'availability', dayId);
                const dayRanges = cleanedAvailability[dayOfWeek] || [];

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
            
            // Update local state with cleaned ranges
            setAvailability(cleanedAvailability);
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
                                <div className="p-3.5 sm:p-4 space-y-4 border-t border-gray-100">
                                    {!isRostered && (
                                        <Button variant="ghost-primary" size="sm" onClick={() => addTimeRange(dayOfWeek)}>
                                            <Icon icon={Plus} size="sm" /> Add range
                                        </Button>
                                    )}
                                    {ranges.length === 0 ? (
                                        <p className="text-label text-center py-2">No availability set</p>
                                    ) : (
                                        ranges.map((range, index) => (
                                            <div key={index} className="flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-4 p-3.5 bg-white border border-gray-100 rounded-xl">
                                                <div className="flex-1 flex gap-3 sm:gap-4">
                                                    <div className="flex-1 min-w-0">
                                                        <label className="text-label block mb-1 text-center">From</label>
                                                        <Input
                                                            type="time"
                                                            value={range.start}
                                                            step="900"
                                                            onChange={(e) => updateTimeRange(dayOfWeek, index, 'start', e.target.value)}
                                                            disabled={isRostered}
                                                            className="text-center px-2"
                                                        />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <label className="text-label block mb-1 text-center">To</label>
                                                        <Input
                                                            type="time"
                                                            value={range.end}
                                                            step="900"
                                                            onChange={(e) => updateTimeRange(dayOfWeek, index, 'end', e.target.value)}
                                                            disabled={isRostered}
                                                            className="text-center px-2"
                                                        />
                                                    </div>
                                                </div>
                                                {!isRostered && (
                                                    <div className="flex justify-center pt-1 sm:pt-0 shrink-0">
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
