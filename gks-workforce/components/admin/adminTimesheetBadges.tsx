'use client';

import Badge from '@/components/ui/Badge';
import Icon from '@/components/ui/Icon';
import { Timesheet, TimesheetStatus, TimesheetSource } from '@/types';
import {
    PenLine,
    MapPin,
    Clock,
    AlertTriangle,
    Timer,
    HelpCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const SOURCE_CONFIG: Record<
    TimesheetSource,
    { label: string; variant: 'neutral' | 'success' | 'warning' | 'danger' | 'info'; icon: LucideIcon }
> = {
    MANUAL: { label: 'Manual', variant: 'neutral', icon: PenLine },
    GPS_VERIFIED: { label: 'GPS verified', variant: 'success', icon: MapPin },
    GPS_OVERTIME: { label: 'Overtime', variant: 'warning', icon: Clock },
    GPS_OUTSIDE: { label: 'Off-site', variant: 'danger', icon: AlertTriangle },
    AUTO_CLOSED: { label: 'Auto-closed', variant: 'warning', icon: Timer },
    GPS_UNMATCHED: { label: 'Unmatched', variant: 'warning', icon: HelpCircle },
    AFTER_HOURS: { label: 'After hours', variant: 'danger', icon: Clock },
};

export function TimesheetSourceBadge({ source, distanceMetres }: { source?: TimesheetSource; distanceMetres?: number | null }) {
    if (!source) return null;
    const cfg = SOURCE_CONFIG[source];
    if (!cfg) return null;
    const label =
        source === 'GPS_OUTSIDE' && distanceMetres != null ? `${cfg.label} (${distanceMetres}m)` : cfg.label;
    return (
        <Badge variant={cfg.variant} className="text-[10px] font-medium tracking-tight rounded-sm px-1.5 py-0.5 shadow-3xs">
            <Icon icon={cfg.icon} size="sm" className="opacity-80" />
            {label}
        </Badge>
    );
}

export function TimesheetStatusBadge({ status }: { status: TimesheetStatus }) {
    switch (status) {
        case 'PENDING':
            return <Badge variant="warning" className="text-[10px] font-medium tracking-tight rounded-sm px-1.5 py-0.5">Pending</Badge>;
        case 'APPROVED':
            return <Badge variant="success" className="text-[10px] font-medium tracking-tight rounded-sm px-1.5 py-0.5">Approved</Badge>;
        case 'REJECTED':
            return <Badge variant="danger" className="text-[10px] font-medium tracking-tight rounded-sm px-1.5 py-0.5">Rejected</Badge>;
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
            return <Badge variant="success" className="text-[10px] font-medium tracking-tight rounded-sm px-1.5 py-0.5">Auto-approved</Badge>;
        case 'FLAGGED':
            return <Badge variant="warning" className="text-[10px] font-medium tracking-tight rounded-sm px-1.5 py-0.5">Flagged</Badge>;
        case 'NEEDS_REVIEW':
            return <Badge variant="warning" className="text-[10px] font-medium tracking-tight rounded-sm px-1.5 py-0.5">Needs review</Badge>;
        case 'REJECTED':
            return <Badge variant="danger" className="text-[10px] font-medium tracking-tight rounded-sm px-1.5 py-0.5">Rejected</Badge>;
        default:
            return null;
    }
}

export function TimesheetFlagChips({ flags }: { flags: string[] }) {
    if (!flags.length) return null;
    return (
        <div className="flex flex-wrap gap-1">
            {flags.map((flag) => (
                <span 
                    key={flag} 
                    className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 bg-slate-50 border border-slate-200/50 px-1.5 py-0.5 rounded-sm"
                >
                    {flag.replace(/_/g, ' ')}
                </span>
            ))}
        </div>
    );
}
