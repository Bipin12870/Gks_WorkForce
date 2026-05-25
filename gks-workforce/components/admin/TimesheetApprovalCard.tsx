'use client';

import { Timesheet } from '@/types';
import { formatDate, processTimesheetAutomation, calculatePayrollRecord } from '@/lib/utils';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import {
    AutomationStatusBadge,
    TimesheetFlagChips,
    TimesheetSourceBadge,
    TimesheetStatusBadge,
} from '@/components/admin/adminTimesheetBadges';

interface TimesheetApprovalCardProps {
    timesheet: Timesheet;
    staffName: string;
    onQuickApprove: () => void;
    onReview: () => void;
    onAdjust: () => void;
    onReject: () => void;
}

export default function TimesheetApprovalCard({
    timesheet: ts,
    staffName,
    onQuickApprove,
    onReview,
    onAdjust,
    onReject,
}: TimesheetApprovalCardProps) {
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

    const borderClass =
        automation.approval.status === 'AUTO_APPROVED'
            ? 'border-green-200'
            : automation.approval.status === 'FLAGGED'
              ? 'border-amber-200'
              : 'border-red-200';

    return (
        <article className={`admin-section-card border ${borderClass}`}>
            <div
                className={`px-4 py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b ${
                    automation.approval.status === 'AUTO_APPROVED'
                        ? 'bg-green-50/50 border-green-100'
                        : automation.approval.status === 'FLAGGED'
                          ? 'bg-amber-50/50 border-amber-100'
                          : 'bg-red-50/50 border-red-100'
                }`}
            >
                <div className="flex flex-wrap items-center gap-2">
                    <AutomationStatusBadge status={automation.approval.status} />
                    <TimesheetSourceBadge source={ts.source} distanceMetres={ts.clockOutDistanceMetres} />
                </div>
                <TimesheetFlagChips flags={automation.classification.flags} />
            </div>

            <div className="p-4 sm:p-5">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
                    <div className="min-w-0">
                        <p className="text-section-title">{staffName}</p>
                        <p className="text-label mt-0.5">
                            {formatDate(ts.date.toDate())} · Roster {ts.approvedShiftStart}–{ts.approvedShiftEnd}
                        </p>
                    </div>
                    <TimesheetStatusBadge status={ts.status} />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 p-3 rounded-xl bg-gray-50 border border-gray-100">
                    <div>
                        <p className="text-label">Approved (roster)</p>
                        <p className="text-sm font-semibold tabular-nums mt-0.5">{approvedHours.toFixed(2)}h</p>
                    </div>
                    <div>
                        <p className="text-label text-blue-700">Worked (raw)</p>
                        <p className="text-sm font-semibold text-blue-700 tabular-nums mt-0.5">{workedHours.toFixed(2)}h</p>
                    </div>
                    <div>
                        <p className="text-label text-green-700">Payable</p>
                        <p className="text-sm font-semibold text-green-700 tabular-nums mt-0.5">{payableHours.toFixed(2)}h</p>
                    </div>
                    <div>
                        <p className="text-label">Difference</p>
                        <p
                            className={`text-sm font-semibold tabular-nums mt-0.5 ${
                                diff > 0 ? 'text-amber-700' : diff < 0 ? 'text-red-600' : 'text-gray-500'
                            }`}
                        >
                            {diff > 0 ? '+' : ''}
                            {diff.toFixed(2)}h
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 mb-4">
                    <span className="text-label">Submitted</span>
                    <span className="text-sm font-medium tabular-nums bg-white px-2 py-1 rounded-md border border-gray-200">
                        {ts.workedStart} – {ts.workedEnd}
                    </span>
                </div>

                {ts.adminNote && (
                    <p className="text-sm text-gray-600 italic mb-4 pl-3 border-l-2 border-gray-200">
                        {ts.adminNote}
                    </p>
                )}

                <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-100">
                    {ts.status === 'PENDING' && !ts.requiresAdminNote && (
                        <Button variant="primary" size="sm" onClick={onQuickApprove}>
                            Quick approve
                        </Button>
                    )}
                    {ts.status === 'PENDING' && ts.requiresAdminNote && (
                        <Button variant="primary" size="sm" onClick={onReview} className="bg-amber-600 hover:bg-amber-700">
                            Review & resolve
                        </Button>
                    )}
                    {(!ts.requiresAdminNote || ts.status !== 'PENDING') && (
                        <Button variant="secondary" size="sm" onClick={onAdjust}>
                            {ts.status === 'PENDING' ? 'Adjust & approve' : 'Correct'}
                        </Button>
                    )}
                    {ts.status !== 'REJECTED' && (
                        <Button variant="ghost-danger" size="sm" onClick={onReject}>
                            Reject
                        </Button>
                    )}
                </div>
            </div>
        </article>
    );
}
