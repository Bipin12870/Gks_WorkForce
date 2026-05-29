'use client';

import { useState } from 'react';
import { Timesheet } from '@/types';
import { formatDate, processTimesheetAutomation, calculatePayrollRecord, formatHoursAndMinutes, formatTimeTo12Hour } from '@/lib/utils';
import {
    TimesheetFlagChips,
    TimesheetSourceBadge,
} from '@/components/admin/adminTimesheetBadges';
import { Check, X, Edit2, ChevronDown, ChevronUp, Calendar, Clock, AlertTriangle, MessageSquare } from 'lucide-react';

const AVATAR_COLORS = [
    { bg: 'bg-blue-50/80', text: 'text-blue-700', border: 'border-blue-200/50' },
    { bg: 'bg-emerald-50/80', text: 'text-emerald-700', border: 'border-emerald-200/50' },
    { bg: 'bg-indigo-50/80', text: 'text-indigo-700', border: 'border-indigo-200/50' },
    { bg: 'bg-violet-50/80', text: 'text-violet-700', border: 'border-violet-200/50' },
    { bg: 'bg-amber-50/80', text: 'text-amber-700', border: 'border-amber-200/50' },
    { bg: 'bg-rose-50/80', text: 'text-rose-700', border: 'border-rose-200/50' },
    { bg: 'bg-sky-50/80', text: 'text-sky-700', border: 'border-sky-200/50' },
];

function getAvatarStyle(name: string) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const idx = Math.abs(hash) % AVATAR_COLORS.length;
    return AVATAR_COLORS[idx];
}

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
        const text = `${sign}${formatHoursAndMinutes(Math.abs(val), true)}`;

        // Significant variance (> 30 mins): use full pill badge
        if (Math.abs(val) > 0.5) {
            const cls =
                val > 0.5
                    ? 'text-amber-600 border-amber-200 bg-amber-50/40'
                    : 'text-rose-500 border-rose-200 bg-rose-50/40';
            return <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${cls}`}>{text}</span>;
        }

        // Minor variance (<= 30 mins): simple clean text
        const colorCls = val > 0 ? 'text-emerald-600' : 'text-rose-500';
        return <span className={`text-[11px] font-medium ${colorCls}`}>{text}</span>;
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
                        {(() => {
                            const style = getAvatarStyle(staffName);
                            return (
                                <div className={`w-7 h-7 rounded-full ${style.bg} border ${style.border} ${style.text} flex items-center justify-center text-[10px] font-semibold uppercase tracking-wide select-none shrink-0`}>
                                    {getInitials(staffName)}
                                </div>
                            );
                        })()}
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
                            {ts.approvedShiftStart ? `${formatTimeTo12Hour(ts.approvedShiftStart)}–${formatTimeTo12Hour(ts.approvedShiftEnd)}` : 'Unscheduled'}
                        </span>
                        {ts.approvedShiftStart && (
                            <span className="text-[10px] text-gray-400 font-medium mt-0.5">{formatHoursAndMinutes(approvedHours, true)} rostered</span>
                        )}
                    </div>
                </td>

                {/* Worked Actuals */}
                <td className="px-5 py-4">
                    <div className="flex flex-col">
                        <span className={`text-sm font-medium tabular-nums ${!ts.workedStart ? 'text-amber-600' : 'text-gray-900'}`}>
                            {ts.workedStart ? `${formatTimeTo12Hour(ts.workedStart)}–${formatTimeTo12Hour(ts.workedEnd)}` : 'No clock-in'}
                        </span>
                        {ts.workedStart && (
                            <span className="text-[10px] text-gray-400 font-medium mt-0.5">{formatHoursAndMinutes(workedHours, true)} clocked</span>
                        )}
                    </div>
                </td>

                {/* Variance */}
                <td className="px-5 py-4">{getVarianceBadge(diff)}</td>

                {/* Source & Integrity */}
                <td className="px-5 py-4">
                    <TimesheetSourceBadge source={ts.source} distanceMetres={ts.clockOutDistanceMetres} />
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
                                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/60 rounded-full transition-all cursor-pointer shadow-3xs"
                                    >
                                        <Check size={11} className="stroke-[2.5]" /> Approve
                                    </button>
                                )}
                                <button
                                    onClick={onReview}
                                    title={ts.requiresAdminNote ? "Requires admin review" : "Review & adjust details"}
                                    className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-[11px] font-semibold border rounded-full transition-all cursor-pointer shadow-3xs ${
                                        ts.requiresAdminNote || !ts.workedStart
                                            ? "text-amber-700 bg-amber-50 border-amber-200/60 hover:bg-amber-100"
                                            : "text-blue-700 bg-blue-50/50 border-blue-200/60 hover:bg-blue-100"
                                    }`}
                                >
                                    <Edit2 size={11} className="stroke-[2.5]" /> Review
                                </button>
                                <button
                                    onClick={onReject}
                                    title="Reject shift"
                                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-[11px] font-semibold text-rose-600 bg-rose-50/50 hover:bg-rose-100 border border-rose-200/60 rounded-full transition-all cursor-pointer shadow-3xs"
                                >
                                    <X size={11} className="stroke-[2.5]" /> Reject
                                </button>
                            </>
                        )}
                        {ts.status === 'APPROVED' && (
                            <button
                                onClick={onReview}
                                title="Submit correction / edit note"
                                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-[11px] font-semibold text-slate-700 bg-slate-50 border border-slate-200/60 rounded-full hover:bg-slate-100 transition-colors cursor-pointer shadow-3xs"
                            >
                                <Edit2 size={11} className="stroke-[2.5]" /> Correct
                            </button>
                        )}
                        {ts.status === 'REJECTED' && (
                            <button
                                onClick={onReview}
                                title="Re-review & approve"
                                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-[11px] font-semibold text-slate-700 bg-slate-50 border border-slate-200/60 rounded-full hover:bg-slate-100 transition-colors cursor-pointer shadow-3xs"
                            >
                                <Edit2 size={11} className="stroke-[2.5]" /> Review
                            </button>
                        )}
                        {/* Expand toggle — icon pill */}
                        <button
                            onClick={() => setIsExpanded(!isExpanded)}
                            title={isExpanded ? 'Collapse' : 'Expand details'}
                            className="inline-flex items-center justify-center w-7 h-7 text-slate-400 border border-slate-200 hover:bg-slate-100 hover:text-slate-600 rounded-full transition-all cursor-pointer"
                        >
                            {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        </button>
                    </div>
                </td>
            </tr>

            {/* Expanded Detailed Audit Panel — flows from parent row */}
            {isExpanded && (
                <tr className="bg-blue-50/10">
                    <td colSpan={8} className="pb-4 pt-0 border-b border-gray-100">
                        {/* Left connector bar — visually links to parent row */}
                        <div className={`ml-[4.5rem] mr-6 border-l-2 ${connectorColor} pl-5`}>
                            <div className="bg-slate-50/40 border border-slate-100 rounded-xl p-4.5 mb-2 mt-2 shadow-3xs flex flex-col gap-4">
                                {/* Data columns */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">

                                    <div className="flex gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5 border border-blue-100/60">
                                            <Calendar size={15} />
                                        </div>
                                        <div className="flex flex-col min-w-0">
                                            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Rostered Shift</span>
                                            <span className="text-sm font-semibold text-gray-800 tabular-nums mt-0.5 leading-tight">
                                                {ts.approvedShiftStart ? `${formatTimeTo12Hour(ts.approvedShiftStart)} – ${formatTimeTo12Hour(ts.approvedShiftEnd)}` : '—'}
                                            </span>
                                            <span className="text-xs text-gray-500 mt-1 leading-none">
                                                {ts.approvedShiftStart ? `${formatHoursAndMinutes(approvedHours)} expected` : 'Unscheduled shift'}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex gap-3">
                                        <div className={`w-8 h-8 rounded-lg ${!ts.workedStart ? 'bg-amber-50 text-amber-600 border-amber-100/60' : 'bg-slate-50 text-slate-600 border-slate-100'} flex items-center justify-center shrink-0 mt-0.5 border`}>
                                            <Clock size={15} />
                                        </div>
                                        <div className="flex flex-col min-w-0">
                                            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Clocked Actuals</span>
                                            <span className={`text-sm font-semibold tabular-nums mt-0.5 leading-tight ${!ts.workedStart ? 'text-amber-700' : 'text-gray-800'}`}>
                                                {ts.workedStart ? `${formatTimeTo12Hour(ts.workedStart)} – ${formatTimeTo12Hour(ts.workedEnd)}` : 'No clock-in'}
                                            </span>
                                            <span className="text-xs text-gray-500 mt-1 leading-none">
                                                {ts.workedStart ? `${formatHoursAndMinutes(workedHours)} tracked` : 'No activity recorded'}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 mt-0.5 border border-emerald-100/60">
                                            <Check size={15} className="stroke-[2.5]" />
                                        </div>
                                        <div className="flex flex-col min-w-0">
                                            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Payable Hours</span>
                                            <span className="text-sm font-semibold text-emerald-700 tabular-nums mt-0.5 leading-tight">
                                                {formatHoursAndMinutes(payableHours, true)}
                                            </span>
                                            <span className={`text-xs mt-1 leading-none font-semibold ${
                                                !ts.approvedShiftStart ? 'text-gray-500'
                                                : diff > 0.5 ? 'text-amber-600'
                                                : diff > 0 ? 'text-emerald-600'
                                                : diff < 0 ? 'text-rose-500'
                                                : 'text-gray-500'
                                            }`}>
                                                {!ts.approvedShiftStart ? 'Unscheduled'
                                                    : diff === 0 ? 'On time'
                                                    : `${diff > 0 ? '+' : ''}${formatHoursAndMinutes(Math.abs(diff), true)} variance`}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex gap-3">
                                        <div className={`w-8 h-8 rounded-lg ${automation.classification.flags.length > 0 ? 'bg-rose-50 text-rose-600 border-rose-100/60' : 'bg-slate-50 text-slate-500 border-slate-100'} flex items-center justify-center shrink-0 mt-0.5 border`}>
                                            <AlertTriangle size={15} />
                                        </div>
                                        <div className="flex flex-col min-w-0 flex-1">
                                            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Integrity / Flags</span>
                                            <div className="mt-1 flex flex-wrap gap-1">
                                                {automation.classification.flags.length > 0
                                                    ? <TimesheetFlagChips flags={automation.classification.flags} />
                                                    : <span className="text-xs text-gray-500 font-medium mt-0.5 leading-none">None</span>
                                                }
                                            </div>
                                            <span className="text-xs text-gray-400 mt-1.5 leading-none font-medium">
                                                {ts.clockOutDistanceMetres != null ? `${ts.clockOutDistanceMetres}m from site` : 'GPS verified'}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Admin note */}
                                {ts.adminNote && (
                                    <div className="pt-3.5 border-t border-slate-100 flex gap-2.5 items-start bg-white/60 p-3 rounded-lg border border-slate-100/50">
                                        <MessageSquare size={14} className="text-slate-400 shrink-0 mt-0.5" />
                                        <div>
                                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Admin note</p>
                                            <p className="text-xs text-slate-600 leading-relaxed font-semibold">{ts.adminNote}</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </td>
                </tr>
            )}
        </>
    );
}
