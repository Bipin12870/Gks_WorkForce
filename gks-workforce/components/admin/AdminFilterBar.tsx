'use client';

import { useState, useRef, useEffect } from 'react';
import AdminWeekPicker from '@/components/admin/AdminWeekPicker';
import { getDayName } from '@/lib/utils';
import { User, Calendar, ChevronDown, Check } from 'lucide-react';

export interface StaffOption {
    id: string;
    name: string;
}

interface AdminFilterBarProps {
    weekStart: Date;
    onWeekPrev: () => void;
    onWeekNext: () => void;
    selectedDay: number;
    onDayChange: (day: number) => void;
    staffValue: string;
    onStaffChange: (staffId: string) => void;
    staffOptions: StaffOption[];
    /** When set, staff select uses ALL + options; when null, staff filter is optional */
    staffAllLabel?: string;
    extra?: React.ReactNode;
    showDay?: boolean;
    showStaff?: boolean;
}

export default function AdminFilterBar({
    weekStart,
    onWeekPrev,
    onWeekNext,
    selectedDay,
    onDayChange,
    staffValue,
    onStaffChange,
    staffOptions,
    staffAllLabel = 'All staff',
    extra,
    showDay = true,
    showStaff = true,
}: AdminFilterBarProps) {
    const days = [1, 2, 3, 4, 5, 6, 0];

    const [isStaffOpen, setIsStaffOpen] = useState(false);
    const [isDayOpen, setIsDayOpen] = useState(false);

    const staffRef = useRef<HTMLDivElement>(null);
    const dayRef = useRef<HTMLDivElement>(null);

    // Close dropdowns on click outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (staffRef.current && !staffRef.current.contains(event.target as Node)) {
                setIsStaffOpen(false);
            }
            if (dayRef.current && !dayRef.current.contains(event.target as Node)) {
                setIsDayOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const selectedStaffName = staffValue === 'ALL'
        ? staffAllLabel
        : (staffOptions.find(s => s.id === staffValue)?.name ?? staffAllLabel);

    const selectedDayLabel = selectedDay === -1
        ? 'All week'
        : getDayName(selectedDay);

    return (
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 w-full mb-6">
                <AdminWeekPicker weekStart={weekStart} onPrev={onWeekPrev} onNext={onWeekNext} />
                <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                    {showDay && (
                        <div className="relative flex-1 sm:flex-none" ref={dayRef}>
                            <button
                                type="button"
                                onClick={() => {
                                    setIsDayOpen(!isDayOpen);
                                    setIsStaffOpen(false);
                                }}
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all select-none cursor-pointer h-10 w-full sm:w-auto justify-between sm:justify-start ${
                                    isDayOpen
                                        ? 'bg-slate-100 text-slate-900'
                                        : selectedDay !== -1
                                            ? 'bg-blue-50/70 text-blue-700 hover:bg-blue-100/70'
                                            : 'bg-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                }`}
                            >
                                <div className="flex items-center gap-2">
                                    <Calendar size={13} className={selectedDay !== -1 ? 'text-blue-500' : 'text-slate-400'} />
                                    <span>
                                        Day: <span className="font-bold">{selectedDayLabel}</span>
                                    </span>
                                </div>
                                <ChevronDown
                                    size={13}
                                    className={`transition-transform duration-200 ${isDayOpen ? 'rotate-180 text-blue-500' : 'text-slate-400'}`}
                                />
                            </button>

                            {isDayOpen && (
                                <div className="absolute left-0 mt-1.5 w-48 bg-white border border-slate-200 rounded-xl shadow-lg p-1.5 z-50 origin-top-left">
                                    <div className="max-h-60 overflow-y-auto">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                onDayChange(-1);
                                                setIsDayOpen(false);
                                            }}
                                            className={`flex items-center justify-between w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                                                selectedDay === -1
                                                    ? 'bg-blue-50 text-blue-700 font-semibold'
                                                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                            }`}
                                        >
                                            <span>All week</span>
                                            {selectedDay === -1 && <Check size={13} />}
                                        </button>

                                        {days.map((day) => {
                                            const isSelected = day === selectedDay;
                                            return (
                                                <button
                                                    key={day}
                                                    type="button"
                                                    onClick={() => {
                                                        onDayChange(day);
                                                        setIsDayOpen(false);
                                                    }}
                                                    className={`flex items-center justify-between w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                                                        isSelected
                                                            ? 'bg-blue-50 text-blue-700 font-semibold'
                                                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                                    }`}
                                                >
                                                    <span>{getDayName(day)}</span>
                                                    {isSelected && <Check size={13} />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    {showStaff && (
                        <div className="relative flex-1 sm:flex-none" ref={staffRef}>
                            <button
                                type="button"
                                onClick={() => {
                                    setIsStaffOpen(!isStaffOpen);
                                    setIsDayOpen(false);
                                }}
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all select-none cursor-pointer h-10 w-full sm:w-auto justify-between sm:justify-start ${
                                    isStaffOpen
                                        ? 'bg-slate-100 text-slate-900'
                                        : staffValue !== 'ALL'
                                            ? 'bg-blue-50/70 text-blue-700 hover:bg-blue-100/70'
                                            : 'bg-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                }`}
                            >
                                <div className="flex items-center gap-2">
                                    <User size={13} className={staffValue !== 'ALL' ? 'text-blue-500' : 'text-slate-400'} />
                                    <span>
                                        Staff: <span className="font-bold">{selectedStaffName}</span>
                                    </span>
                                </div>
                                <ChevronDown
                                    size={13}
                                    className={`transition-transform duration-200 ${isStaffOpen ? 'rotate-180 text-blue-500' : 'text-slate-400'}`}
                                />
                            </button>

                            {isStaffOpen && (
                                <div className="absolute left-0 mt-1.5 w-56 bg-white border border-slate-200 rounded-xl shadow-lg p-1.5 z-50 origin-top-left">
                                    <div className="max-h-60 overflow-y-auto">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                onStaffChange('ALL');
                                                setIsStaffOpen(false);
                                            }}
                                            className={`flex items-center justify-between w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                                                staffValue === 'ALL'
                                                    ? 'bg-blue-50 text-blue-700 font-semibold'
                                                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                            }`}
                                        >
                                            <div className="flex items-center gap-2">
                                                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                                                    staffValue === 'ALL' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
                                                }`}>
                                                    ALL
                                                </div>
                                                <span>{staffAllLabel}</span>
                                            </div>
                                            {staffValue === 'ALL' && <Check size={13} />}
                                        </button>

                                        {staffOptions.map((s) => {
                                            const isSelected = s.id === staffValue;
                                            const initials = s.name
                                                .split(' ')
                                                .map((n) => n[0])
                                                .join('')
                                                .substring(0, 2)
                                                .toUpperCase();
                                            return (
                                                <button
                                                    key={s.id}
                                                    type="button"
                                                    onClick={() => {
                                                        onStaffChange(s.id);
                                                        setIsStaffOpen(false);
                                                    }}
                                                    className={`flex items-center justify-between w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                                                        isSelected
                                                            ? 'bg-blue-50 text-blue-700 font-semibold'
                                                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${
                                                            isSelected ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
                                                        }`}>
                                                            {initials}
                                                        </div>
                                                        <span>{s.name}</span>
                                                    </div>
                                                    {isSelected && <Check size={13} />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    {extra}
                </div>
            </div>
    );
}
