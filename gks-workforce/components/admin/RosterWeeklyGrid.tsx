'use client';

import { useMemo } from 'react';
import { Availability, Shift, User } from '@/types';
import { getDayName, parseTime } from '@/lib/utils';
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

    // Helpers to quickly look up availability and shifts
    const getAvailability = (staffId: string, dayOfWeek: number) => {
        return availability.find((a) => a.staffId === staffId && a.dayOfWeek === dayOfWeek);
    };

    const getShift = (staffId: string, targetDate: Date) => {
        return shifts.find((s) => {
            const shiftDate = s.date instanceof Date ? s.date : (s.date as any).toDate();
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
        <div className="w-full overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-md overflow-hidden">
            <div className="min-w-[900px]">
                {/* Header Row */}
                <div className="flex border-b border-slate-200 bg-slate-50/80 backdrop-blur-xs">
                    <div className="w-48 shrink-0 border-r border-slate-200 px-5 py-4 flex flex-col justify-center bg-slate-50/40">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Staff Member</span>
                    </div>
                    {weekDates.map((date) => {
                        const dayOfWeek = date.getDay();
                        const isToday = new Date().toDateString() === date.toDateString();
                        return (
                            <div 
                                key={date.toISOString()} 
                                className={`flex-1 border-r border-slate-200 last:border-r-0 px-3 py-3 text-center transition-all ${
                                    isToday ? 'bg-blue-50/40 relative' : ''
                                }`}
                            >
                                {isToday && (
                                    <div className="absolute top-0 left-0 right-0 h-1 bg-blue-500" />
                                )}
                                <span className={`block text-xs font-bold uppercase tracking-wider ${isToday ? 'text-blue-600' : 'text-slate-500'}`}>
                                    {getDayName(dayOfWeek)}
                                </span>
                                <span className={`block text-sm font-semibold mt-0.5 ${isToday ? 'text-blue-700 font-bold' : 'text-slate-800'}`}>
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
                            <div className="w-8 h-8 rounded-full bg-blue-100 border border-blue-200 text-blue-700 flex items-center justify-center text-xs font-bold shrink-0">
                                {getInitials(member.name)}
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-bold text-slate-800 truncate" title={member.name}>
                                    {member.name}
                                </p>
                            </div>
                        </div>

                        {/* Day Cells */}
                        {weekDates.map((date) => {
                            const dayOfWeek = date.getDay();
                            const avail = getAvailability(member.id, dayOfWeek);
                            const shift = getShift(member.id, date);
                            
                            const hasAvail = avail && avail.timeRanges && avail.timeRanges.length > 0;
                            const isUnavailable = !hasAvail;

                            // Cell styles based on availability
                            const bgStyle = isUnavailable ? {
                                backgroundImage: 'repeating-linear-gradient(45deg, #fef2f2 0px, #fef2f2 8px, #fee2e2 8px, #fee2e2 16px)'
                            } : {};

                            return (
                                <div
                                    key={`${member.id}-${date.toISOString()}`}
                                    className={`flex-1 border-r border-slate-100 last:border-r-0 p-2 relative group cursor-pointer transition-all flex items-center justify-center ${
                                        isUnavailable 
                                            ? 'border-red-100/50' 
                                            : hasAvail
                                                ? 'bg-emerald-50/20 hover:bg-emerald-50/50 hover:ring-1 hover:ring-emerald-300/40'
                                                : 'hover:bg-blue-50/40 hover:ring-1 hover:ring-blue-300/50'
                                    }`}
                                    onClick={() => onCellClick(member.id, dayOfWeek, shift)}
                                    style={bgStyle}
                                >
                                    {shift ? (
                                        // Shift Block
                                        <div className={`w-full h-full rounded-xl border flex flex-col justify-center items-center px-2 py-1 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
                                            shift.availabilityOverride 
                                            ? 'bg-amber-50 border-amber-300 text-amber-900' 
                                            : 'bg-blue-600 border-blue-700 text-white'
                                        }`}>
                                            <span className="text-[12px] font-extrabold tracking-tight">
                                                {shift.startTime} – {shift.endTime}
                                            </span>
                                            <div className="flex items-center gap-1 mt-1 opacity-90">
                                                <Clock size={11} />
                                                <span className="text-[10px] font-bold">{getDurationHrs(shift.startTime, shift.endTime)} hrs</span>
                                            </div>
                                        </div>
                                    ) : isUnavailable ? (
                                        // Unavailable badge
                                        <div className="bg-red-100/70 border border-red-200/50 rounded-lg px-2 py-1 flex items-center justify-center shadow-xs">
                                            <span className="text-[9px] font-bold text-red-600 tracking-wider uppercase">
                                                Unavailable
                                            </span>
                                        </div>
                                    ) : (
                                        // Available but no shift - fully visible
                                        <div className="w-full h-full flex flex-col justify-center items-center transition-all">
                                            {/* Hover State: Click to Add */}
                                            <div className="hidden group-hover:flex flex-col items-center justify-center">
                                                <span className="text-[10px] font-extrabold text-blue-700 bg-blue-100/90 px-2 py-1.5 rounded-lg border border-blue-200 shadow-xs hover:bg-blue-600 hover:text-white transition-colors">
                                                    + Add Shift
                                                </span>
                                            </div>
                                            
                                            {/* Normal State: Show Available Hours clearly */}
                                            <div className="group-hover:hidden flex flex-col items-center justify-center">
                                                <div className="bg-emerald-100/70 border border-emerald-200/50 rounded-lg px-2.5 py-1 flex flex-col items-center justify-center shadow-xs">
                                                    <span className="text-[11px] font-extrabold text-emerald-800 tracking-tight">
                                                        {avail.timeRanges[0].start}–{avail.timeRanges[0].end}
                                                    </span>
                                                    <span className="text-[9px] font-extrabold text-emerald-600/90 tracking-wide uppercase mt-0.5">
                                                        Available
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>
            
            {/* Legend */}
            <div className="flex flex-wrap items-center gap-5 px-5 py-3.5 border-t border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500">
                <div className="flex items-center gap-2">
                    <div className="w-3.5 h-3.5 rounded-md bg-blue-600 shadow-xs border border-blue-700" />
                    <span>Scheduled Shift</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3.5 h-3.5 rounded-md bg-amber-50 shadow-xs border border-amber-300" />
                    <span>Availability Override</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <span>Available Time Window</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-7 h-3.5 rounded-md border border-red-200/50" style={{ backgroundImage: 'repeating-linear-gradient(45deg, #fef2f2 0px, #fef2f2 4px, #fee2e2 4px, #fee2e2 8px)' }} />
                    <span>Staff Unavailable</span>
                </div>
                <div className="ml-auto text-[11px] text-slate-400 font-medium italic">
                    Click any cell to schedule, modify, or delete a shift
                </div>
            </div>
        </div>
    );
}
