'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';
import { Shift } from '@/types';
import { getWeekStart, getDayName, formatDate, calculateHours } from '@/lib/utils';
import StaffPageShell from '@/components/staff/StaffPageShell';
import StaffWeekPicker from '@/components/staff/StaffWeekPicker';
import StaffStatCard from '@/components/staff/StaffStatCard';
import StaffListRow from '@/components/staff/StaffListRow';
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

    useEffect(() => {
        const today = new Date().getDay();
        const withShifts = new Set<number>();
        shifts.forEach((s) => withShifts.add(s.date.toDate().getDay()));
        
        // Auto-expand today and any days with scheduled shifts
        const next = new Set<number>([today, ...withShifts]);
        setExpandedDays(next);
    }, [shifts, selectedWeek]);

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
        <StaffPageShell title="My roster" description="Approved shifts for the selected week">
            <Card padding={false} className="mb-6 p-4.5">
                <StaffWeekPicker
                    weekStart={selectedWeek}
                    onPrev={() => changeWeek('prev')}
                    onNext={() => changeWeek('next')}
                />
            </Card>

            {loading ? (
                <Spinner className="py-16" />
            ) : (
                <>
                    <div className="grid grid-cols-2 gap-3 mb-6">
                        <StaffStatCard
                            label="Scheduled hours"
                            value={totalHours.toFixed(2)}
                            suffix="hrs"
                            accent="blue"
                        />
                        <StaffStatCard
                            label="Projected pay"
                            value={projectedPay.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                            })}
                            prefix="$"
                            accent="green"
                        />
                    </div>

                    {!hasAnyShifts ? (
                        <Card>
                            <EmptyState
                                icon={CalendarDays}
                                title="No shifts this week"
                                description="When your roster is published, shifts will appear here."
                            />
                        </Card>
                    ) : (
                        <div className="space-y-2">
                            {WEEK_DAYS.map((dayOfWeek) => {
                                const dayShifts = getShiftsForDay(dayOfWeek);
                                const isExpanded = expandedDays.has(dayOfWeek);
                                const isEmpty = dayShifts.length === 0;
                                const todayState = isToday(dayOfWeek);

                                if (isEmpty && !isExpanded) {
                                    return (
                                        <button
                                            key={dayOfWeek}
                                            type="button"
                                            onClick={() => toggleDay(dayOfWeek)}
                                            className={`w-full card-base px-4 py-3 flex items-center justify-between text-left min-h-11 focus-visible:ring-2 focus-visible:ring-blue-500 ${
                                                todayState ? 'border-l-4 border-l-blue-600 pl-3.5 bg-blue-50/10' : ''
                                            }`}
                                        >
                                            <span className="text-section-title">
                                                {getDayName(dayOfWeek)}
                                                {todayState && <span className="text-xs text-blue-600 font-semibold ml-1.5">(Today)</span>}
                                            </span>
                                            <span className="text-label">No shifts</span>
                                        </button>
                                    );
                                }

                                return (
                                    <div key={dayOfWeek} className={`card-base overflow-hidden ${
                                        todayState ? 'border-l-4 border-l-blue-600 bg-blue-50/5' : ''
                                    }`}>
                                        <button
                                            type="button"
                                            onClick={() => toggleDay(dayOfWeek)}
                                            className={`w-full px-4 py-3 flex items-center justify-between border-b border-gray-100 min-h-11 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${
                                                todayState ? 'pl-3.5' : ''
                                            }`}
                                            aria-expanded={isExpanded}
                                        >
                                            <span className="text-section-title">
                                                {getDayName(dayOfWeek)}
                                                {todayState && <span className="text-xs text-blue-600 font-semibold ml-1.5">(Today)</span>}
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
                                            <div className={`p-3 space-y-2 ${todayState ? 'pl-3.5' : ''}`}>
                                                {isEmpty ? (
                                                    <p className="text-label text-center py-4">No shifts scheduled</p>
                                                ) : (
                                                    dayShifts.map((shift) => {
                                                        const durationHours = calculateHours(shift.startTime, shift.endTime);
                                                        return (
                                                            <StaffListRow
                                                                key={shift.id}
                                                                icon={Clock}
                                                                iconClassName="text-blue-600"
                                                                title={
                                                                    <p className="text-section-title">
                                                                        {shift.startTime} – {shift.endTime}
                                                                        <span className="text-xs text-gray-500 font-medium ml-1.5">
                                                                            ({durationHours.toFixed(2)} hrs)
                                                                        </span>
                                                                    </p>
                                                                }
                                                                subtitle={
                                                                    <p className="text-label">{formatDate(shift.date.toDate())}</p>
                                                                }
                                                                trailing={<Badge variant="success">Confirmed</Badge>}
                                                            />
                                                        );
                                                    })
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </>
            )}
        </StaffPageShell>
    );
}
