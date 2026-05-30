'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';
import { Shift } from '@/types';
import { getWeekStart, calculateHours, formatHoursAndMinutes, formatTimeTo12Hour } from '@/lib/utils';
import StaffPageShell from '@/components/staff/StaffPageShell';
import StaffWeekPicker from '@/components/staff/StaffWeekPicker';
import StaffStatCard from '@/components/staff/StaffStatCard';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import Card from '@/components/ui/Card';
import { CalendarDays, Clock, CircleDollarSign } from 'lucide-react';

const WEEK_DAYS = [1, 2, 3, 4, 5, 6, 0];

export default function StaffRosterPage() {
    const { userData } = useAuth();
    const [selectedWeek, setSelectedWeek] = useState<Date>(getWeekStart(new Date()));
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [loading, setLoading] = useState(true);

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
                    <div className="grid grid-cols-2 gap-3 mb-5 shrink-0">
                        <StaffStatCard
                            label="Scheduled"
                            value={`${totalHours}h`}
                            icon={Clock}
                            accent={isPastWeek() ? 'gray' : 'blue'}
                        />
                        <StaffStatCard
                            label="Projected pay"
                            value={projectedPay.toLocaleString(undefined, {
                                minimumFractionDigits: 0,
                                maximumFractionDigits: 0,
                            })}
                            prefix="$"
                            icon={CircleDollarSign}
                            accent={isPastWeek() ? 'gray' : 'green'}
                        />
                    </div>

                    <div className="flex items-center gap-3 mb-6 shrink-0">
                        <span className="text-sm font-medium text-slate-700 whitespace-nowrap">Weekly schedule</span>
                        <div className="h-px bg-slate-200 flex-1" />
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
                            <div className="relative pl-1">
                                {WEEK_DAYS.map((dayOfWeek, idx) => {
                                    const dayShifts = getShiftsForDay(dayOfWeek);
                                    const isEmpty = dayShifts.length === 0;
                                    const todayState = isToday(dayOfWeek);
                                    const dayDate = getDayDate(dayOfWeek);
                                    const formattedDate = dayDate.toLocaleDateString('en-US', {
                                        weekday: 'long',
                                        month: 'short',
                                        day: 'numeric'
                                    });

                                    const isFirst = idx === 0;
                                    const isLast = idx === WEEK_DAYS.length - 1;

                                    const today = new Date();
                                    today.setHours(0, 0, 0, 0);

                                    const checkDate = new Date(dayDate);
                                    checkDate.setHours(0, 0, 0, 0);

                                    const isPast = checkDate.getTime() < today.getTime();

                                    let lineColor = "bg-slate-200";
                                    let dotColor = "bg-slate-200";

                                    if (!isEmpty) {
                                        if (isPast) {
                                            lineColor = "bg-amber-400";
                                            dotColor = "bg-amber-500";
                                        } else {
                                            lineColor = "bg-blue-500";
                                            dotColor = "bg-blue-500";
                                        }
                                    }

                                    const totalDailyHours = dayShifts.reduce(
                                        (sum, s) => sum + calculateHours(s.startTime, s.endTime),
                                        0
                                    );

                                    return (
                                        <div
                                            key={dayOfWeek}
                                            className="relative pl-4 pb-8 last:pb-0"
                                        >

                                            {/* Row 1: Date & Duration */}
                                            <div className="flex items-center justify-between text-sm font-semibold text-slate-800 h-5 pr-8">
                                                <div className="flex items-center gap-2">
                                                    <span className={isEmpty ? "text-slate-400 font-medium" : "text-slate-800"}>
                                                        {formattedDate}
                                                    </span>
                                                    {todayState && (
                                                        <span className="text-xs text-blue-600 font-semibold">
                                                            (Today)
                                                        </span>
                                                    )}
                                                </div>
                                                {isEmpty ? (
                                                    <span className="text-lg text-slate-200 font-bold">Off</span>
                                                ) : (
                                                    <span className="tabular-nums text-slate-800 font-semibold">
                                                        {formatHoursAndMinutes(totalDailyHours)}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Row 2: Shift Intervals & Duration Bar */}
                                            {!isEmpty && (
                                                <div className="mt-1">
                                                    <div className="space-y-1">
                                                        {dayShifts.map((shift) => (
                                                            <div
                                                                key={shift.id}
                                                                className="text-xs font-medium text-slate-500"
                                                            >
                                                                {formatTimeTo12Hour(shift.startTime)} – {formatTimeTo12Hour(shift.endTime)}
                                                            </div>
                                                        ))}
                                                    </div>
                                                    <div className="w-full max-w-[220px] h-1.5 rounded-full bg-slate-200 overflow-hidden mt-1.5">
                                                        <div 
                                                            className="h-full rounded-full transition-all duration-500 bg-blue-500"
                                                            style={{ width: `${Math.min((totalDailyHours / 12) * 100, 100)}%` }}
                                                        />
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
