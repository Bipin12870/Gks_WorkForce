'use client';

import Badge from '@/components/ui/Badge';
import { TimesheetStatus, TimesheetSource } from '@/types';

// ── Source display config ──
// GPS_VERIFIED renders nothing (it's the default/normal state).
// GPS_OUTSIDE is dead code since geofence is enforced on clock-out,
// but kept in config for historical data display.
const SOURCE_DISPLAY: Record<string, { label: string; className: string }> = {
    MANUAL:       { label: 'Manual',      className: 'text-gray-500' },
    GPS_OVERTIME: { label: 'Overtime',    className: 'text-amber-600' },
    AUTO_CLOSED:  { label: 'Auto-closed', className: 'text-amber-600' },
    GPS_UNMATCHED:{ label: 'Unmatched',   className: 'text-amber-600' },
    AFTER_HOURS:  { label: 'After hours', className: 'text-rose-600' },
    GPS_OUTSIDE:  { label: 'Off-site',    className: 'text-rose-600' },
};

/**
 * Renders the timesheet source as clean inline text.
 * GPS_VERIFIED = blank (it's the norm, no label needed).
 * Anomalous sources get a subtle colored label.
 */
export function TimesheetSourceBadge({ source }: { source?: TimesheetSource }) {
    if (!source || source === 'GPS_VERIFIED') return null;

    const cfg = SOURCE_DISPLAY[source];
    if (!cfg) return null;

    return (
        <span className={`text-xs font-medium ${cfg.className}`}>
            {cfg.label}
        </span>
    );
}

export function TimesheetStatusBadge({ status }: { status: TimesheetStatus }) {
    switch (status) {
        case 'PENDING':
            return <Badge variant="warning" className="text-[10px] font-medium tracking-tight rounded-full px-2.5 py-0.5 border border-current/10">Pending</Badge>;
        case 'APPROVED':
            return <Badge variant="success" className="text-[10px] font-medium tracking-tight rounded-full px-2.5 py-0.5 border border-current/10">Approved</Badge>;
        case 'REJECTED':
            return <Badge variant="danger" className="text-[10px] font-medium tracking-tight rounded-full px-2.5 py-0.5 border border-current/10">Rejected</Badge>;
        default:
            return null;
    }
}

export function AutomationStatusBadge({
    status,
}: {
    status: 'AUTO_APPROVED' | 'FLAGGED' | 'NEEDS_REVIEW' | 'REJECTED';
}) {
    switch (status) {
        case 'AUTO_APPROVED':
            return <Badge variant="success" className="text-[10px] font-medium tracking-tight rounded-full px-2.5 py-0.5 border border-current/10">Auto-approved</Badge>;
        case 'FLAGGED':
            return <Badge variant="warning" className="text-[10px] font-medium tracking-tight rounded-full px-2.5 py-0.5 border border-current/10">Flagged</Badge>;
        case 'NEEDS_REVIEW':
            return <Badge variant="warning" className="text-[10px] font-medium tracking-tight rounded-full px-2.5 py-0.5 border border-current/10">Needs review</Badge>;
        case 'REJECTED':
            return <Badge variant="danger" className="text-[10px] font-medium tracking-tight rounded-full px-2.5 py-0.5 border border-current/10">Rejected</Badge>;
        default:
            return null;
    }
}

/**
 * Renders flag chips as clean, compact labels.
 * Filters out EARLY_CLOCK_IN (low-value noise) and GPS_OUTSIDE (dead).
 */
export function TimesheetFlagChips({ flags }: { flags: string[] }) {
    // Filter out noise flags
    const meaningful = flags.filter(f => f !== 'EARLY_CLOCK_IN' && f !== 'GPS_OUTSIDE');
    if (!meaningful.length) return null;

    const getFlagStyle = (flag: string) => {
        switch (flag) {
            case 'AFTER_HOURS':
                return 'text-rose-600';
            case 'OVERTIME':
            case 'LATE_CLOCK_IN':
                return 'text-amber-600';
            case 'MANUAL_EDIT_DETECTED':
            default:
                return 'text-gray-500';
        }
    };

    const getFlagLabel = (flag: string) => {
        switch (flag) {
            case 'AFTER_HOURS':
                return 'After hours';
            case 'MANUAL_EDIT_DETECTED':
                return 'Manual edit';
            case 'LATE_CLOCK_IN':
                return 'Late clock-in';
            case 'OVERTIME':
                return 'Overtime';
            default:
                return flag.replace(/_/g, ' ').toLowerCase();
        }
    };

    return (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
            {meaningful.map((flag) => (
                <span
                    key={flag}
                    className={`text-xs font-medium ${getFlagStyle(flag)}`}
                >
                    {getFlagLabel(flag)}
                </span>
            ))}
        </div>
    );
}
