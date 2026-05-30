'use client';

import { useState } from 'react';
import { Timesheet } from '@/types';
import { formatDate, processTimesheetAutomation, calculatePayrollRecord, formatHoursAndMinutes, formatTimeTo12Hour } from '@/lib/utils';
import {
    TimesheetFlagChips,
    TimesheetSourceBadge,
} from '@/components/admin/adminTimesheetBadges';
import { Check, X, Edit2, ChevronDown, ChevronUp, MessageSquare } from 'lucide-react';

// ── Deterministic avatar colors keyed by name hash ──
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
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
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

    const getInitials = (name: string) =>
        name.split(' ').map((n) => n[0]).join('').toUpperCase().substring(0, 2);

    // ── Variance display ──
    // ≤5 min: em dash (trivial rounding, not meaningful)
    // 6–30 min: clean colored text
    // >30 min: colored text with dot indicator
    // ── Variance display ──
    // ≤5 min: null (trivial, no sub-label)
    // >5 min: clean text-xs colored text
    const renderVariance = (val: number) => {
        if (Math.abs(val) <= 5 / 60) {
            return null;
        }

        const sign = val > 0 ? '+' : '';
        const text = `${sign}${formatHoursAndMinutes(Math.abs(val), true)}`;
        const colorCls = val > 0 ? 'text-amber-600' : 'text-rose-500';

        return <span className={`text-xs font-medium tabular-nums ${colorCls}`}>{text}</span>;
    };

    // ── Status indicator via left border ──
    const statusBorderColor =
        ts.status === 'APPROVED' ? 'border-l-emerald-400' :
        ts.status === 'REJECTED' ? 'border-l-rose-400' :
        'border-l-amber-300';

    // ── Meaningful flags for the expanded panel ──
    const meaningfulFlags = automation.classification.flags.filter(
        f => f !== 'EARLY_CLOCK_IN' && f !== 'GPS_OUTSIDE'
    );
    const hasExpandableContent = meaningfulFlags.length > 0 || ts.adminNote;

    return (
        <>
            <tr
                className={`border-b border-gray-50 transition-colors hover:bg-gray-50/50 ${
                    isSelected ? 'bg-blue-50/20' : ''
                } ${hasExpandableContent ? 'cursor-pointer' : ''}`}
                onClick={() => hasExpandableContent && setIsExpanded(!isExpanded)}
            >
                {/* Checkbox */}
                <td className={`border-l-[3px] ${statusBorderColor} px-4 py-3.5`} onClick={(e) => e.stopPropagation()}>
                    {ts.status === 'PENDING' && !ts.requiresAdminNote && ts.workedStart ? (
                        <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={onSelectToggle}
                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
                        />
                    ) : (
                        <div className="w-4 h-4" />
                    )}
                </td>

                {/* Employee */}
                <td className="px-5 py-3.5">
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

                {/* Date */}
                <td className="px-5 py-3.5 text-sm text-gray-600 tabular-nums">
                    {formatDate(ts.date.toDate())}
                </td>

                {/* Rostered Shift — clean, no sub-text */}
                <td className="px-5 py-3.5 text-sm text-gray-500 tabular-nums">
                    {ts.approvedShiftStart
                        ? `${formatTimeTo12Hour(ts.approvedShiftStart)}–${formatTimeTo12Hour(ts.approvedShiftEnd)}`
                        : <span className="text-gray-300 italic">Unscheduled</span>
                    }
                </td>

                {/* Clocked Time — clean, no sub-text */}
                <td className="px-5 py-3.5 text-sm tabular-nums">
                    <div className="flex flex-col">
                        {ts.workedStart ? (
                            <span className="text-gray-900 font-medium">
                                {formatTimeTo12Hour(ts.workedStart)}–{formatTimeTo12Hour(ts.workedEnd)}
                            </span>
                        ) : (
                            <span className="text-amber-600">No clock-in</span>
                        )}
                        <TimesheetSourceBadge source={ts.source} />
                    </div>
                </td>

                {/* Payable */}
                <td className="px-5 py-3.5 text-sm tabular-nums">
                    <div className="flex flex-col">
                        <span className="text-gray-900 font-semibold">
                            {formatHoursAndMinutes(payableHours, true)}
                        </span>
                        {renderVariance(diff)}
                    </div>
                </td>

                {/* Actions */}
                <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1.5 justify-end">
                        {ts.status === 'PENDING' && (
                            <>
                                {!ts.requiresAdminNote && ts.workedStart && (
                                    <button
                                        onClick={onQuickApprove}
                                        title="Approve"
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                                    >
                                        <Check size={13} className="stroke-[2.5]" /> Approve
                                    </button>
                                )}
                                <button
                                    onClick={onReview}
                                    title={ts.requiresAdminNote ? 'Requires admin review' : 'Review & adjust'}
                                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                                        ts.requiresAdminNote || !ts.workedStart
                                            ? 'text-amber-700 hover:bg-amber-50'
                                            : 'text-gray-600 hover:bg-gray-100'
                                    }`}
                                >
                                    <Edit2 size={13} className="stroke-[2]" /> Review
                                </button>
                                <button
                                    onClick={onReject}
                                    title="Reject"
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                >
                                    <X size={13} className="stroke-[2.5]" /> Reject
                                </button>
                            </>
                        )}
                        {ts.status === 'APPROVED' && (
                            <button
                                onClick={onReview}
                                title="Submit correction"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                            >
                                <Edit2 size={13} className="stroke-[2]" /> Correct
                            </button>
                        )}
                        {ts.status === 'REJECTED' && (
                            <button
                                onClick={onReview}
                                title="Re-review & approve"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                            >
                                <Edit2 size={13} className="stroke-[2]" /> Review
                            </button>
                        )}
                        {/* Expand toggle — only shown if there's expandable content */}
                        {hasExpandableContent && (
                            <button
                                onClick={() => setIsExpanded(!isExpanded)}
                                title={isExpanded ? 'Collapse' : 'View details'}
                                className="inline-flex items-center justify-center w-7 h-7 text-gray-400 hover:bg-gray-100 hover:text-gray-600 rounded-lg transition-colors cursor-pointer"
                            >
                                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>
                        )}
                    </div>
                </td>
            </tr>

            {/* ── Compact Expanded Panel ── */}
            {isExpanded && hasExpandableContent && (
                <tr>
                    <td colSpan={7} className="px-5 pb-4 pt-1 border-b border-gray-100 bg-gray-50/30">
                        <div className="ml-12 flex flex-col gap-2.5">

                            {/* Flags — only if present */}
                            {meaningfulFlags.length > 0 && (
                                <div className="flex items-center gap-4 text-xs">
                                    <span className="text-gray-400 font-medium uppercase tracking-wider">Flags</span>
                                    <TimesheetFlagChips flags={meaningfulFlags} />
                                </div>
                            )}

                            {/* Admin note — only if present */}
                            {ts.adminNote && (
                                <div className="flex items-start gap-2 text-xs bg-white border border-gray-100 rounded-lg p-3 mt-0.5">
                                    <MessageSquare size={13} className="text-gray-400 shrink-0 mt-0.5" />
                                    <div>
                                        <span className="text-gray-400 font-medium uppercase tracking-wider text-[10px]">Admin note</span>
                                        <p className="text-gray-700 mt-0.5 leading-relaxed">{ts.adminNote}</p>
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
