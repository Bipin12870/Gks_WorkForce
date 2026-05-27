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
        if (val === 0) return <span className="text-gray-300 font-normal text-xs">—</span>;
        const sign = val > 0 ? '+' : '';
        const text = `${sign}${val.toFixed(2)}h`;
        const cls =
            val > 0.5
                ? 'text-amber-600 border-amber-200 bg-amber-50/40'
                : val > 0
                ? 'text-emerald-600 border-emerald-200 bg-emerald-50/40'
                : 'text-rose-500 border-rose-200 bg-rose-50/40';
        return <span className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full border ${cls}`}>{text}</span>;
    };

    const statusBorderColor =
        ts.status === 'APPROVED' ? 'border-l-emerald-500' :
        ts.status === 'REJECTED' ? 'border-l-rose-500' :
        'border-l-amber-400';

    const connectorColor =
        ts.status === 'APPROVED' ? 'border-emerald-200' :
        ts.status === 'REJECTED' ? 'border-rose-200' :
        'border-amber-200';

    return (
        <>
            <tr
                className={`border-b border-gray-50 transition-all hover:bg-gray-50/60 cursor-pointer ${
                    isSelected ? 'bg-blue-50/30 hover:bg-blue-50/40' : ''
                }`}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                {/* Bulk Select Checkbox */}
                <td className={`border-l-4 ${statusBorderColor} px-4 py-3`} onClick={(e) => e.stopPropagation()}>
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
                <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-gray-100 border border-gray-200 text-gray-500 flex items-center justify-center text-[10px] font-semibold uppercase tracking-wide select-none shrink-0">
                            {getInitials(staffName)}
                        </div>
                        <span className="font-medium text-gray-900 text-sm truncate max-w-[140px]" title={staffName}>
                            {staffName}
                        </span>
                    </div>
                </td>

                {/* Date & Day */}
                <td className="px-5 py-4 text-gray-600 text-sm font-medium tabular-nums">
                    {formatDate(ts.date.toDate())}
                </td>

                {/* Rostered Schedule */}
                <td className="px-5 py-4">
                    <div className="flex flex-col">
                        <span className="text-gray-500 text-sm font-medium tabular-nums">
                            {ts.approvedShiftStart ? `${ts.approvedShiftStart}\u2013${ts.approvedShiftEnd}` : 'Unscheduled'}
                        </span>
                        {ts.approvedShiftStart && (
                            <span className="text-[10px] text-gray-400 font-medium mt-0.5">{approvedHours.toFixed(2)}h rostered</span>
                        )}
                    </div>
                </td>

                {/* Worked Actuals */}
                <td className="px-5 py-4">
                    <div className="flex flex-col">
                        <span className={`text-sm font-medium tabular-nums ${!ts.workedStart ? 'text-amber-600' : 'text-gray-900'}`}>
                            {ts.workedStart ? `${ts.workedStart}\u2013${ts.workedEnd}` : 'No clock-in'}
                        </span>
                        {ts.workedStart && (
                            <span className="text-[10px] text-gray-400 font-medium mt-0.5">{workedHours.toFixed(2)}h clocked</span>
                        )}
                    </div>
                </td>

                {/* Variance */}
                <td className="px-5 py-4">{getVarianceBadge(diff)}</td>

                {/* Source & Integrity */}
                <td className="px-5 py-4">
                    <div className="flex flex-col gap-1 items-start">
                        <TimesheetSourceBadge source={ts.source} distanceMetres={ts.clockOutDistanceMetres} />
                        {automation.approval.status !== 'AUTO_APPROVED' && (
                            <TimesheetFlagChips flags={automation.classification.flags} />
                        )}
                    </div>
                </td>

                {/* Row Actions */}
                <td className="px-5 py-4" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2 justify-end">
                        {ts.status === 'PENDING' && (
                            <>
                                {!ts.requiresAdminNote && ts.workedStart && (
                                    <button
                                        onClick={onQuickApprove}
                                        title="Approve immediately"
                                        className="inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-medium text-emerald-600 border border-emerald-300 rounded-full hover:bg-emerald-50 transition-all cursor-pointer"
                                    >
                                        <Check size={11} /> Approve
                                    </button>
                                )}
                                <button
                                    onClick={onReview}
                                    title={ts.requiresAdminNote ? "Requires admin review" : "Review & adjust details"}
                                    className={`inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-medium border rounded-full transition-all cursor-pointer ${
                                        ts.requiresAdminNote || !ts.workedStart
                                            ? "text-amber-600 border-amber-300 hover:bg-amber-50"
                                            : "text-gray-500 border-gray-200 hover:bg-gray-50"
                                    }`}
                                >
                                    <Edit2 size={11} /> Review
                                </button>
                                <button
                                    onClick={onReject}
                                    title="Reject shift"
                                    className="inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-medium text-red-500 border border-red-200 rounded-full hover:bg-red-50 transition-all cursor-pointer"
                                >
                                    <X size={11} /> Reject
                                </button>
                            </>
                        )}
                        {ts.status === 'APPROVED' && (
                            <button
                                onClick={onReview}
                                title="Submit correction / edit note"
                                className="inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-medium text-gray-500 border border-gray-200 rounded-full hover:bg-gray-50 transition-colors cursor-pointer"
                            >
                                <Edit2 size={11} /> Correct
                            </button>
                        )}
                        {ts.status === 'REJECTED' && (
                            <button
                                onClick={onReview}
                                title="Re-review & approve"
                                className="inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-medium text-gray-500 border border-gray-200 rounded-full hover:bg-gray-50 transition-colors cursor-pointer"
                            >
                                Review
                            </button>
                        )}
                        {/* Expand toggle — icon pill */}
                        <button
                            onClick={() => setIsExpanded(!isExpanded)}
                            title={isExpanded ? 'Collapse' : 'Expand details'}
                            className="inline-flex items-center justify-center w-7 h-7 text-gray-400 border border-gray-200 rounded-full hover:bg-gray-50 hover:text-gray-600 transition-all cursor-pointer"
                        >
                            {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        </button>
                    </div>
                </td>
            </tr>

            {/* Expanded Detailed Audit Panel — flows from parent row */}
            {isExpanded && (
                <tr className="bg-blue-50/20">
                    <td colSpan={8} className="pb-4 pt-0 border-b border-gray-100">
                        {/* Left connector bar — visually links to parent row */}
                        <div className={`ml-[4.5rem] mr-6 border-l-2 ${connectorColor} pl-5`}>

                            {/* Data columns */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-4 py-4">

                                <div className="flex flex-col gap-0.5">
                                    <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Rostered</span>
                                    <span className="text-sm font-medium text-gray-700 tabular-nums">
                                        {ts.approvedShiftStart ? `${ts.approvedShiftStart} – ${ts.approvedShiftEnd}` : '—'}
                                    </span>
                                    <span className="text-xs text-gray-400">
                                        {ts.approvedShiftStart ? `${approvedHours.toFixed(2)}h expected` : 'Unscheduled shift'}
                                    </span>
                                </div>

                                <div className="flex flex-col gap-0.5">
                                    <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Clocked</span>
                                    <span className={`text-sm font-medium tabular-nums ${!ts.workedStart ? 'text-gray-400' : 'text-gray-700'}`}>
                                        {ts.workedStart ? `${ts.workedStart} – ${ts.workedEnd}` : 'No clock-in'}
                                    </span>
                                    <span className="text-xs text-gray-400">
                                        {ts.workedStart ? `${workedHours.toFixed(2)}h tracked` : 'No activity recorded'}
                                    </span>
                                </div>

                                <div className="flex flex-col gap-0.5">
                                    <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Payable</span>
                                    <span className="text-sm font-semibold text-emerald-600 tabular-nums">{payableHours.toFixed(2)}h</span>
                                    <span className={`text-xs ${
                                        !ts.approvedShiftStart ? 'text-gray-400'
                                        : diff > 0.5 ? 'text-amber-500'
                                        : diff > 0 ? 'text-emerald-500'
                                        : diff < 0 ? 'text-red-400'
                                        : 'text-gray-400'
                                    }`}>
                                        {!ts.approvedShiftStart ? 'Unscheduled'
                                            : diff === 0 ? 'On time'
                                            : `${diff > 0 ? '+' : ''}${diff.toFixed(2)}h variance`}
                                    </span>
                                </div>

                                <div className="flex flex-col gap-1">
                                    <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Flags</span>
                                    {automation.classification.flags.length > 0
                                        ? <TimesheetFlagChips flags={automation.classification.flags} />
                                        : <span className="text-xs text-gray-400">None</span>
                                    }
                                    <span className="text-xs text-gray-400">
                                        {ts.clockOutDistanceMetres != null ? `${ts.clockOutDistanceMetres}m from site` : 'GPS verified'}
                                    </span>
                                </div>
                            </div>

                            {/* Admin note */}
                            {ts.adminNote && (
                                <div className="pt-3 border-t border-gray-100/80">
                                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Admin note</p>
                                    <p className="text-xs text-gray-600 leading-relaxed">{ts.adminNote}</p>
                                </div>
                            )}
                        </div>
                    </td>
                </tr>
            )}
        </>
    );
}
