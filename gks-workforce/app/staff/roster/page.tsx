'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';
import { Shift } from '@/types';
import { getWeekStart, getDayName, formatDate, calculateHours, formatHoursAndMinutes, formatTimeTo12Hour } from '@/lib/utils';
import StaffPageShell from '@/components/staff/StaffPageShell';
import StaffWeekPicker from '@/components/staff/StaffWeekPicker';
import StaffStatCard from '@/components/staff/StaffStatCard';
import Badge from '@/components/ui/Badge';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import Card from '@/components/ui/Card';
import Icon from '@/components/ui/Icon';
import { CalendarDays, ChevronDown, Clock } from 'lucide-react';

const WEEK_DAYS = [1, 2, 3, 4, 5, 6, 0];

export default function StaffRosterPage() {
    const { userData } = useAuth();
    const [selectedWeek, setSelectedWeek] = useState<Date>(getWeekStart(new Date()));
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedDays, setExpandedDays] = useState<Set<number>>(() => new Set([new Date().getDay()]));

    const getDayDate = (dayIndex: number) => {
        const d = new Date(selectedWeek);
        const currentMondayDay = 1;
        let offset = dayIndex - currentMondayDay;
        if (offset < 0) offset += 7;
        d.setDate(d.getDate() + offset);
        return d;
    };

    const isToday = (dayIndex: number) => {
        const dayDate = getDayDate(dayIndex);
        const today = new Date();
        return dayDate.getDate() === today.getDate() &&
            dayDate.getMonth() === today.getMonth() &&
            dayDate.getFullYear() === today.getFullYear();
    };

    const isPastWeek = () => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const weekEnd = new Date(selectedWeek);
        weekEnd.setDate(weekEnd.getDate() + 7);
        weekEnd.setHours(0, 0, 0, 0);
        return weekEnd.getTime() <= today.getTime();
    };

    const isPastDay = (dayIndex: number) => {
        const dayDate = getDayDate(dayIndex);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        dayDate.setHours(0, 0, 0, 0);
        return dayDate.getTime() < today.getTime();
    };

    useEffect(() => {
        if (!userData || userData.role !== 'STAFF') return;

        const weekStart = new Date(selectedWeek);
        const weekEnd = new Date(selectedWeek);
        weekEnd.setDate(weekEnd.getDate() + 7);

        const q = query(
            collection(db, 'shifts'),
            where('staffId', '==', userData.id),
            where('date', '>=', Timestamp.fromDate(weekStart)),
            where('date', '<', Timestamp.fromDate(weekEnd))
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const loadedShifts: Shift[] = [];
            snapshot.forEach((doc) => {
                loadedShifts.push({ id: doc.id, ...doc.data() } as Shift);
            });
            setShifts(loadedShifts);

            // Auto-expand today and any days with scheduled shifts
            const today = new Date().getDay();
            const withShifts = new Set<number>();
            loadedShifts.forEach((s) => withShifts.add(s.date.toDate().getDay()));
            const next = new Set<number>([today, ...withShifts]);
            setExpandedDays(next);

            setLoading(false);
        });

        return () => unsubscribe();
    }, [selectedWeek, userData]);

    const changeWeek = (direction: 'prev' | 'next') => {
        const newWeek = new Date(selectedWeek);
        newWeek.setDate(newWeek.getDate() + (direction === 'next' ? 7 : -7));
        setSelectedWeek(getWeekStart(newWeek));
    };

    const getShiftsForDay = (dayOfWeek: number) =>
        shifts.filter((shift) => shift.date.toDate().getDay() === dayOfWeek);

    const totalHours = shifts.reduce((sum, s) => sum + calculateHours(s.startTime, s.endTime), 0);
    const projectedPay = totalHours * (userData?.hourlyRate || 0);

    const hasAnyShifts = shifts.length > 0;

    const toggleDay = (day: number) => {
        setExpandedDays((prev) => {
            const next = new Set(prev);
            if (next.has(day)) next.delete(day);
            else next.add(day);
            return next;
        });
    };

    return (
        <StaffPageShell title="My roster">
            <div className="flex justify-center mb-5 shrink-0">
                <div className="w-full max-w-xs">
                    <StaffWeekPicker
                        weekStart={selectedWeek}
                        onPrev={() => changeWeek('prev')}
                        onNext={() => changeWeek('next')}
                    />
                </div>
            </div>

            {loading ? (
                <div className="flex-1 flex items-center justify-center">
                    <Spinner />
                </div>
            ) : (
                <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                    <div className="grid grid-cols-2 gap-3 mb-10 shrink-0">
                        <StaffStatCard
                            label="Scheduled hours"
                            value={formatHoursAndMinutes(totalHours, true)}
                            accent={isPastWeek() ? 'gray' : 'blue'}
                        />
                        <StaffStatCard
                            label="Projected pay"
                            value={projectedPay.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                            })}
                            prefix="$"
                            accent={isPastWeek() ? 'gray' : 'green'}
                        />
                    </div>

                    <div className="flex items-center gap-3 mb-4 shrink-0">
                        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">
                            Weekly Schedule
                        </span>
                        <div className="h-px bg-gray-200 flex-1" />
                    </div>

                    {!hasAnyShifts ? (
                        <div className="shrink-0">
                            <Card>
                                <EmptyState
                                    icon={CalendarDays}
                                    title="No shifts this week"
                                    description="When your roster is published, shifts will appear here."
                                />
                            </Card>
                        </div>
                    ) : (
                        <div className="flex-1 overflow-y-auto pr-0.5 pb-4">
                            <div className="bg-white divide-y divide-gray-100 overflow-hidden">
                                {WEEK_DAYS.map((dayOfWeek) => {
                                    const dayShifts = getShiftsForDay(dayOfWeek);
                                    const isExpanded = expandedDays.has(dayOfWeek);
                                    const isEmpty = dayShifts.length === 0;
                                    const todayState = isToday(dayOfWeek);
                                    const pastState = isPastDay(dayOfWeek);

                                    if (isEmpty && !isExpanded) {
                                        return (
                                            <div
                                                key={dayOfWeek}
                                                className={`transition-all ${todayState
                                                        ? 'border-l-4 border-l-blue-600 bg-blue-50/5'
                                                        : pastState
                                                            ? 'border-l-4 border-l-gray-300 bg-gray-50/30 opacity-80'
                                                            : ''
                                                    }`}
                                            >
                                                <button
                                                    key={dayOfWeek}
                                                    type="button"
                                                    onClick={() => toggleDay(dayOfWeek)}
                                                    className={`w-full flex items-center justify-between py-5 pr-4 min-h-11 transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${todayState || pastState ? 'pl-3' : 'pl-4'
                                                        } hover:bg-gray-50/50 text-gray-900`}
                                                >
                                                    <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                                                        {getDayName(dayOfWeek)}
                                                        {todayState && <span className="text-xs text-blue-600 font-semibold">(Today)</span>}
                                                    </span>
                                                    <span className="text-xs text-gray-400 font-medium">No shifts</span>
                                                </button>
                                            </div>
                                        );
                                    }

                                    return (
                                        <div
                                            key={dayOfWeek}
                                            className={`transition-all ${todayState
                                                    ? 'border-l-4 border-l-blue-600 bg-blue-50/5'
                                                    : pastState
                                                        ? 'border-l-4 border-l-gray-300 bg-gray-50/30 opacity-80'
                                                        : ''
                                                }`}
                                        >
                                            <button
                                                type="button"
                                                onClick={() => toggleDay(dayOfWeek)}
                                                className={`w-full flex items-center justify-between py-5 pr-4 min-h-11 transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${todayState || pastState ? 'pl-3' : 'pl-4'
                                                    } hover:bg-gray-50/50 text-gray-900`}
                                                aria-expanded={isExpanded}
                                            >
                                                <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                                                    {getDayName(dayOfWeek)}
                                                    {todayState && <span className="text-xs text-blue-600 font-semibold">(Today)</span>}
                                                </span>
                                                <div className="flex items-center gap-2">
                                                    {dayShifts.length > 0 && (
                                                        <Badge variant="neutral">{dayShifts.length} shift{dayShifts.length !== 1 ? 's' : ''}</Badge>
                                                    )}
                                                    <Icon
                                                        icon={ChevronDown}
                                                        size="sm"
                                                        className={`text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                                    />
                                                </div>
                                            </button>
                                            {isExpanded && (
                                                <div className={`relative ${todayState || pastState ? 'pl-3' : 'pl-4'} pr-4 pb-4 pt-0`}>
                                                    {/* Continuous vertical guide line bridging from button row to first item */}
                                                    {!isEmpty && (
                                                        <div className={`absolute -top-5 h-8 w-[2px] bg-emerald-500 ${todayState || pastState ? 'left-[27px]' : 'left-[31px]'}`} />
                                                    )}

                                                    <div className="space-y-3 mt-1">
                                                        {isEmpty ? (
                                                            <p className="text-xs text-gray-400 text-center py-4">No shifts scheduled</p>
                                                        ) : (
                                                            dayShifts.map((shift, idx) => {
                                                                const durationHours = calculateHours(shift.startTime, shift.endTime);
                                                                return (
                                                                    <div key={shift.id} className="relative py-2 pl-8 flex items-start justify-between gap-4">
                                                                        {/* Vertical line segment */}
                                                                        {idx < dayShifts.length - 1 ? (
                                                                            <div className="absolute top-0 bottom-0 left-[15px] w-[2px] bg-emerald-500" />
                                                                        ) : (
                                                                            <div className="absolute top-0 h-[18px] left-[15px] w-[2px] bg-emerald-500" />
                                                                        )}

                                                                        {/* Clock Icon Node sitting centered on top of the line */}
                                                                        <div className="absolute left-[6px] top-[8px] w-5 h-5 rounded-full bg-white z-10 flex items-center justify-center shadow-xs">
                                                                            <Icon icon={Clock} size="sm" className="text-emerald-500" />
                                                                        </div>

                                                                        {/* Left side: Shift times */}
                                                                        <div className="min-w-0 flex-1">
                                                                            <span className="text-base font-bold text-gray-900">
                                                                                {formatTimeTo12Hour(shift.startTime)} – {formatTimeTo12Hour(shift.endTime)}
                                                                            </span>
                                                                        </div>

                                                                        {/* Right side: Duration & Date stacked */}
                                                                        <div className="shrink-0 text-right">
                                                                            <span className="text-sm font-bold text-gray-900 block">
                                                                                {formatHoursAndMinutes(durationHours)}
                                                                            </span>
                                                                            <p className="text-xs font-semibold text-gray-500 mt-0.5">
                                                                                {formatDate(shift.date.toDate())}
                                                                            </p>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </StaffPageShell>
    );
}
