'use client';

import { useMemo } from 'react';
import { Availability, Shift, User } from '@/types';
import { getDayName, parseTime, formatTimeTo12Hour } from '@/lib/utils';
import { Clock } from 'lucide-react';

interface RosterWeeklyGridProps {
    staff: User[];
    shifts: Shift[];
    availability: Availability[];
    weekStart: Date;
    onCellClick: (staffId: string, dayOfWeek: number, existingShift?: Shift) => void;
}

export default function RosterWeeklyGrid({
    staff,
    shifts,
    availability,
    weekStart,
    onCellClick,
}: RosterWeeklyGridProps) {
    // Generate dates for the week
    const weekDates = useMemo(() => {
        const dates = [];
        for (let i = 0; i < 7; i++) {
            const date = new Date(weekStart);
            date.setDate(date.getDate() + i);
            dates.push(date);
        }
        return dates;
    }, [weekStart]);

    const isPastDate = (date: Date) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        return d.getTime() < today.getTime();
    };

    // Helpers to quickly look up availability and shifts
    const getAvailability = (staffId: string, dayOfWeek: number) => {
        return availability.find((a) => a.staffId === staffId && a.dayOfWeek === dayOfWeek);
    };

    const getShift = (staffId: string, targetDate: Date) => {
        return shifts.find((s) => {
            const shiftDate = s.date instanceof Date ? s.date : (s.date as { toDate: () => Date }).toDate();
            return s.staffId === staffId && shiftDate.toDateString() === targetDate.toDateString();
        });
    };

    // Helper for shift duration
    const getDurationHrs = (startTime: string, endTime: string) => {
        const start = parseTime(startTime);
        const end = parseTime(endTime);
        const startMin = start.hours * 60 + start.minutes;
        const endMin = end.hours * 60 + end.minutes;
        const durationMins = endMin - startMin;
        return (durationMins / 60).toFixed(1).replace(/\.0$/, ''); // e.g. 6.5, or 6
    };

    // Helper to get initials
    const getInitials = (name: string) => {
        return name
            .split(' ')
            .map((n) => n[0])
            .join('')
            .toUpperCase()
            .substring(0, 2);
    };

    return (
        <div className="w-full max-h-[calc(100vh-240px)] overflow-auto rounded-xl border border-slate-200 bg-white shadow-xs">
            <div className="min-w-[900px]">
                {/* Header Row */}
                <div className="flex border-b border-slate-200 bg-slate-50/95 backdrop-blur-md sticky top-0 z-20 shadow-xs">
                    <div className="w-48 shrink-0 border-r border-slate-200 px-5 py-4 flex flex-col justify-center bg-slate-50">
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Staff Member</span>
                    </div>
                    {weekDates.map((date) => {
                        const dayOfWeek = date.getDay();
                        const isToday = new Date().toDateString() === date.toDateString();
                        const isPast = isPastDate(date);
                        return (
                            <div
                                key={date.toISOString()}
                                className={`flex-1 border-r border-slate-200 last:border-r-0 px-3 py-3 text-center transition-all ${
                                    isToday ? 'bg-blue-50/40 relative' : isPast ? 'bg-slate-100/30' : ''
                                }`}
                            >
                                {isToday && (
                                    <div className="absolute top-0 left-0 right-0 h-[3px] bg-blue-600" />
                                )}
                                <span className={`block text-xs font-semibold uppercase tracking-wider ${isToday ? 'text-blue-600' : isPast ? 'text-slate-400' : 'text-slate-500'}`}>
                                    {getDayName(dayOfWeek)}
                                </span>
                                <span className={`block text-sm font-semibold mt-0.5 ${isToday ? 'text-blue-700 font-semibold' : isPast ? 'text-slate-500 font-normal' : 'text-slate-800'}`}>
                                    {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </span>
                            </div>
                        );
                    })}
                </div>

                {/* Staff Rows */}
                {staff.map((member, idx) => (
                    <div
                        key={member.id}
                        className={`flex border-b border-slate-100 last:border-b-0 hover:bg-slate-50/20 transition-colors ${
                            idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'
                        }`}
                        style={{ height: '80px' }}
                    >
                        {/* Staff Name Column */}
                        <div className="w-48 shrink-0 border-r border-slate-200 px-5 flex items-center gap-3 bg-slate-50/10">
                            <div className="w-8 h-8 rounded-full bg-blue-100 border border-blue-200 text-blue-700 flex items-center justify-center text-xs font-semibold shrink-0">
                                {getInitials(member.name)}
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-700 truncate" title={member.name}>
                                    {member.name}
                                </p>
                            </div>
                        </div>

                        {/* Day Cells */}
                        {weekDates.map((date) => {
                            const dayOfWeek = date.getDay();
                            const avail = getAvailability(member.id, dayOfWeek);
                            const shift = getShift(member.id, date);
                            const isPast = isPastDate(date);

                            const hasAvail = avail && avail.timeRanges && avail.timeRanges.length > 0;
                            const isUnavailable = !hasAvail;

                            return (
                                <div
                                    key={`${member.id}-${date.toISOString()}`}
                                    className={`flex-1 border-r border-slate-100 last:border-r-0 p-2 relative group cursor-pointer transition-all flex items-center justify-center ${
                                        isPast
                                            ? isUnavailable
                                                ? 'bg-slate-100/40 border-slate-100'
                                                : 'bg-slate-50/30 hover:bg-slate-100/40'
                                            : isUnavailable
                                                ? 'bg-red-50/30 border-red-100/30 hover:bg-red-50/50'
                                                : hasAvail
                                                    ? 'bg-emerald-50/20 hover:bg-emerald-50/50 hover:ring-1 hover:ring-emerald-300/40'
                                                    : 'hover:bg-blue-50/40 hover:ring-1 hover:ring-blue-300/50'
                                    }`}
                                    onClick={() => onCellClick(member.id, dayOfWeek, shift)}
                                >
                                    {shift ? (
                                        <div
                                            className={`w-full h-full rounded-lg border flex flex-col justify-center items-center px-1 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
                                                isPast
                                                    ? 'bg-slate-100 border-slate-200 text-slate-500'
                                                    : shift.availabilityOverride
                                                        ? 'bg-amber-50 border-amber-300 text-amber-900'
                                                        : 'bg-blue-600 border-blue-700 text-white'
                                            }`}
                                            title={`${getDurationHrs(shift.startTime, shift.endTime)} hrs total`}
                                        >
                                            <span className="text-[11px] font-semibold tracking-tight whitespace-nowrap group-hover:hidden">
                                                {formatTimeTo12Hour(shift.startTime)}–{formatTimeTo12Hour(shift.endTime)}
                                            </span>
                                            <div className="hidden group-hover:flex items-center gap-1.5 opacity-95">
                                                <Clock size={12} />
                                                <span className="text-[11px] font-bold">{getDurationHrs(shift.startTime, shift.endTime)} hrs</span>
                                            </div>
                                        </div>
                                    ) : isUnavailable ? (
                                        <span className={`text-[11px] font-medium tracking-tight ${
                                            isPast ? 'text-slate-400/80' : 'text-rose-600/70'
                                        }`}>
                                            Unavailable
                                        </span>
                                    ) : (
                                        <div className="w-full h-full flex flex-col justify-center items-center transition-all">
                                            <div className="hidden group-hover:flex flex-col items-center justify-center">
                                                <span className="text-[10px] font-semibold text-blue-700 bg-blue-100/90 px-2.5 py-1 rounded-md border border-blue-200 shadow-xs hover:bg-blue-600 hover:text-white transition-colors">
                                                    + Add Shift
                                                </span>
                                            </div>

                                            <div className="group-hover:hidden flex flex-col items-center justify-center text-center">
                                                <span className={`text-[11px] font-semibold tracking-tight ${isPast ? 'text-slate-400' : 'text-slate-700'}`}>
                                                    {formatTimeTo12Hour(avail.timeRanges[0].start)}–{formatTimeTo12Hour(avail.timeRanges[0].end)}
                                                </span>
                                                <span className={`text-[9px] font-semibold tracking-wide uppercase mt-0.5 ${isPast ? 'text-slate-400/70' : 'text-emerald-600'}`}>
                                                    Available
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
}
