'use client';

import { useState } from 'react';
import { Timesheet } from '@/types';
import { formatDate, processTimesheetAutomation, calculatePayrollRecord } from '@/lib/utils';
import {
    AutomationStatusBadge,
    TimesheetFlagChips,
    TimesheetSourceBadge,
    TimesheetStatusBadge,
} from '@/components/admin/adminTimesheetBadges';
import Icon from '@/components/ui/Icon';
import { Check, X, Edit2, AlertCircle, ChevronDown, ChevronUp, MapPin } from 'lucide-react';

interface TimesheetTableRowProps {
    timesheet: Timesheet;
    staffName: string;
    isSelected: boolean;
    onSelectToggle: () => void;
    onQuickApprove: () => void;
    onReview: () => void;
    onReject: () => void;
}

export default function TimesheetTableRow({
    timesheet: ts,
    staffName,
    isSelected,
    onSelectToggle,
    onQuickApprove,
    onReview,
    onReject,
}: TimesheetTableRowProps) {
    const [isExpanded, setIsExpanded] = useState(false);

    const automation = processTimesheetAutomation(
        ts.workedStart,
        ts.workedEnd,
        { start: ts.approvedShiftStart, end: ts.approvedShiftEnd },
        undefined,
        ts.source === 'MANUAL'
    );

    const approvedPayroll = calculatePayrollRecord(ts.approvedShiftStart, ts.approvedShiftEnd);
    const approvedHours = approvedPayroll.rawMinutes / 60;
    const workedHours = automation.payroll.rawMinutes / 60;
    const payableHours = automation.payroll.roundedPayableMinutes / 60;
    const diff = workedHours - approvedHours;

    const getInitials = (name: string) => {
        return name
            .split(' ')
            .map((n) => n[0])
            .join('')
            .toUpperCase()
            .substring(0, 2);
    };

    // Style variance badge
    const getVarianceBadge = (val: number) => {
        if (val === 0) return <span className="text-slate-350 font-normal text-xs">-</span>;
        const sign = val > 0 ? '+' : '';
        const text = `${sign}${val.toFixed(2)}h`;
        const cls =
            val > 0.5
                ? 'bg-amber-50/50 text-amber-800 border-amber-200/40'
                : val > 0
                ? 'bg-emerald-50/60 text-emerald-800 border-emerald-250/20'
                : 'bg-rose-50/50 text-rose-800 border-rose-200/40';
        return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-sm border ${cls}`}>{text}</span>;
    };

    return (
        <>
            <tr
                className={`border-b border-slate-100/70 transition-all hover:bg-slate-50/50 cursor-pointer ${
                    isSelected ? 'bg-slate-50 hover:bg-slate-100/40' : ''
                }`}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                {/* Bulk Select Checkbox */}
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    {ts.status === 'PENDING' && !ts.requiresAdminNote && ts.workedStart ? (
                        <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={onSelectToggle}
                            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
                        />
                    ) : (
                        <div className="w-4 h-4" />
                    )}
                </td>

                {/* Staff Info */}
                <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                        <div className="w-6 h-6 rounded bg-slate-100 border border-slate-200/50 text-slate-550 flex items-center justify-center text-[10px] font-bold uppercase tracking-wider select-none shrink-0">
                            {getInitials(staffName)}
                        </div>
                        <span className="font-medium text-slate-900 text-sm truncate max-w-[140px]" title={staffName}>
                            {staffName}
                        </span>
                    </div>
                </td>

                {/* Date & Day */}
                <td className="px-4 py-3 text-slate-700 text-sm font-medium tabular-nums">
                    {formatDate(ts.date.toDate())}
                </td>

                {/* Rostered Schedule */}
                <td className="px-4 py-3">
                    <div className="flex flex-col">
                        <span className="text-slate-500 text-sm font-medium tabular-nums">
                            {ts.approvedShiftStart ? `${ts.approvedShiftStart}–${ts.approvedShiftEnd}` : 'Unscheduled'}
                        </span>
                        {ts.approvedShiftStart && (
                            <span className="text-[10px] text-slate-400 font-medium">{approvedHours.toFixed(2)}h rostered</span>
                        )}
                    </div>
                </td>

                {/* Worked Actuals */}
                <td className="px-4 py-3">
                    <div className="flex flex-col">
                        <span className={`text-sm font-semibold tabular-nums ${!ts.workedStart ? 'text-amber-600 font-medium' : 'text-slate-900'}`}>
                            {ts.workedStart ? `${ts.workedStart}–${ts.workedEnd}` : 'No clock-in'}
                        </span>
                        {ts.workedStart && (
                            <span className="text-[10px] text-slate-550 font-medium">{workedHours.toFixed(2)}h clocked</span>
                        )}
                    </div>
                </td>

                {/* Variance */}
                <td className="px-4 py-3">{getVarianceBadge(diff)}</td>

                {/* Source & Integrity */}
                <td className="px-4 py-3">
                    <div className="flex flex-col gap-1 items-start">
                        <TimesheetSourceBadge source={ts.source} distanceMetres={ts.clockOutDistanceMetres} />
                        {automation.approval.status !== 'AUTO_APPROVED' && (
                            <TimesheetFlagChips flags={automation.classification.flags} />
                        )}
                    </div>
                </td>

                {/* Row Actions */}
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1 justify-end">
                        {ts.status === 'PENDING' && (
                            <>
                                {!ts.requiresAdminNote && ts.workedStart && (
                                    <button
                                        onClick={onQuickApprove}
                                        title="Approve immediately"
                                        className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50/60 hover:border-emerald-255/40 transition-all border border-transparent rounded-md cursor-pointer"
                                    >
                                        <Check size={14} />
                                    </button>
                                )}
                                <button
                                    onClick={onReview}
                                    title={ts.requiresAdminNote ? "Requires admin review" : "Review & adjust details"}
                                    className={`p-1.5 transition-all border border-transparent rounded-md cursor-pointer ${
                                        ts.requiresAdminNote || !ts.workedStart
                                            ? "text-amber-600 hover:text-amber-705 hover:bg-amber-50 hover:border-amber-200/60"
                                            : "text-slate-400 hover:text-slate-700 hover:bg-slate-50 hover:border-slate-200"
                                    }`}
                                >
                                    <Edit2 size={14} />
                                </button>
                                <button
                                    onClick={onReject}
                                    title="Reject shift"
                                    className="p-1.5 text-slate-400 hover:text-red-650 hover:bg-red-50/65 hover:border-red-200/40 transition-all border border-transparent rounded-md cursor-pointer"
                                >
                                    <X size={14} />
                                </button>
                            </>
                        )}
                        {ts.status === 'APPROVED' && (
                            <button
                                onClick={onReview}
                                title="Submit correction / edit note"
                                className="px-2 py-0.5 text-[11px] font-semibold border border-slate-200 rounded hover:bg-slate-50 text-slate-600 transition-colors flex items-center gap-1 cursor-pointer"
                            >
                                <Edit2 size={10} /> Correct
                            </button>
                        )}
                        {ts.status === 'REJECTED' && (
                            <button
                                onClick={onReview}
                                title="Re-review & approve"
                                className="px-2 py-0.5 text-[11px] font-semibold border border-slate-200 rounded hover:bg-slate-50 text-slate-655 transition-colors flex items-center gap-1 cursor-pointer"
                            >
                                Review
                            </button>
                        )}
                        <button className="p-1 text-slate-400 hover:text-slate-600 ml-0.5 cursor-pointer">
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                    </div>
                </td>
            </tr>

            {/* Expanded Detailed Audit Panel */}
            {isExpanded && (
                <tr className="bg-slate-50/30">
                    <td colSpan={8} className="px-6 py-4 border-b border-slate-100/60">
                        <div className="border border-slate-200/80 rounded-xl bg-white p-5 shadow-xs flex flex-col gap-5">
                            {/* Comparison Column Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                {/* Column 1: Roster */}
                                <div className="flex flex-col gap-1">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                        Rostered Schedule
                                    </span>
                                    <span className="text-sm font-semibold text-slate-800 tabular-nums">
                                        {ts.approvedShiftStart ? `${ts.approvedShiftStart} – ${ts.approvedShiftEnd}` : 'Unscheduled'}
                                    </span>
                                    <span className="text-xs text-slate-500 font-medium">
                                        {ts.approvedShiftStart ? `${approvedHours.toFixed(2)}h expected` : 'No roster entry'}
                                    </span>
                                </div>

                                {/* Column 2: Clocked */}
                                <div className="flex flex-col gap-1 md:pl-6 md:border-l border-slate-100">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                        Clocked Actuals
                                    </span>
                                    <span className={`text-sm font-semibold tabular-nums ${!ts.workedStart ? 'text-slate-400 font-medium' : 'text-slate-800'}`}>
                                        {ts.workedStart ? `${ts.workedStart} – ${ts.workedEnd}` : 'No clock-in'}
                                    </span>
                                    <span className="text-xs text-slate-500 font-medium">
                                        {ts.workedStart ? `${workedHours.toFixed(2)}h tracked` : 'No recorded activity'}
                                    </span>
                                </div>

                                {/* Column 3: Payable & Variance */}
                                <div className="flex flex-col gap-1 md:pl-6 md:border-l border-slate-100">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                        Rounded Payable
                                    </span>
                                    <span className="text-sm font-bold text-emerald-700 tabular-nums">
                                        {payableHours.toFixed(2)}h
                                    </span>
                                    <span className={`text-xs font-semibold ${
                                        !ts.approvedShiftStart 
                                            ? 'text-slate-400' 
                                            : diff > 0.5 
                                                ? 'text-amber-600' 
                                                : diff > 0 
                                                    ? 'text-emerald-750' 
                                                    : diff < 0 
                                                        ? 'text-rose-600' 
                                                        : 'text-slate-400'
                                    }`}>
                                        {!ts.approvedShiftStart 
                                            ? 'Unscheduled shift' 
                                            : diff === 0 
                                                ? 'Match' 
                                                : `Variance: ${diff > 0 ? '+' : ''}${diff.toFixed(2)}h`}
                                    </span>
                                </div>

                                {/* Column 4: System Audit */}
                                <div className="flex flex-col gap-1 md:pl-6 md:border-l border-slate-100">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                        Audit Trail
                                    </span>
                                    <span className="text-sm font-semibold text-slate-800 capitalize">
                                        {ts.source.toLowerCase().replace(/_/g, ' ')}
                                    </span>
                                    <div className="flex flex-col gap-1 items-start">
                                        <span className="text-xs text-slate-500 font-medium">
                                            {ts.clockOutDistanceMetres != null 
                                                ? `${ts.clockOutDistanceMetres}m from shop` 
                                                : 'GPS verified'}
                                        </span>
                                        {automation.classification.flags.length > 0 && (
                                            <div className="mt-1">
                                                <TimesheetFlagChips flags={automation.classification.flags} />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Column 5: Notes Callout */}
                            {ts.adminNote && (
                                <div className="pt-4 border-t border-slate-100">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                                        Admin Resolution Note
                                    </span>
                                    <div className="bg-slate-50/50 border border-slate-200/50 p-3 rounded-lg text-xs text-slate-650 leading-relaxed max-w-4xl border-l-2 border-l-slate-400 font-medium">
                                        {ts.adminNote}
                                    </div>
                                </div>
                            )}
                        </div>
                    </td>
                </tr>
            )}
        </>
    );
}
