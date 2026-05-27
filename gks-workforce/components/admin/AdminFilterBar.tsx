'use client';

import AdminWeekPicker from '@/components/admin/AdminWeekPicker';
import { getDayName } from '@/lib/utils';

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
    showDayAndStaff?: boolean;
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
    showDayAndStaff = true,
}: AdminFilterBarProps) {
    const days = [1, 2, 3, 4, 5, 6, 0];

    return (
        <div className="admin-toolbar mb-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 w-full">
                <AdminWeekPicker weekStart={weekStart} onPrev={onWeekPrev} onNext={onWeekNext} />
                <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                    {showDayAndStaff && (
                        <>
                            <div className="flex items-center gap-2 flex-1 sm:flex-none min-w-[140px]">
                                <label className="text-label hidden sm:block shrink-0">Day</label>
                                <select
                                    value={selectedDay}
                                    onChange={(e) => onDayChange(Number(e.target.value))}
                                    className="input-base py-2 min-h-10 flex-1 sm:w-40"
                                >
                                    <option value={-1}>All week</option>
                                    {days.map((day) => (
                                        <option key={day} value={day}>
                                            {getDayName(day)}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex items-center gap-2 flex-1 sm:flex-none min-w-[140px]">
                                <label className="text-label hidden sm:block shrink-0">Staff</label>
                                <select
                                    value={staffValue}
                                    onChange={(e) => onStaffChange(e.target.value)}
                                    className="input-base py-2 min-h-10 flex-1 sm:w-44"
                                >
                                    <option value="ALL">{staffAllLabel}</option>
                                    {staffOptions.map((s) => (
                                        <option key={s.id} value={s.id}>
                                            {s.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </>
                    )}
                    {extra}
                </div>
            </div>
        </div>
    );
}
