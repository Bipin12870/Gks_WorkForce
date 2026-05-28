'use client';

import Badge from '@/components/ui/Badge';
import Icon from '@/components/ui/Icon';
import { TimesheetStatus, TimesheetSource } from '@/types';
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
        <Badge variant={cfg.variant} className="text-[10px] font-medium tracking-tight rounded-full px-2.5 py-0.5 shadow-3xs border border-current/10">
            <Icon icon={cfg.icon} size="sm" className="opacity-80" />
            {label}
        </Badge>
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

export function TimesheetFlagChips({ flags }: { flags: string[] }) {
    if (!flags.length) return null;
    return (
        <div className="flex flex-wrap gap-1">
            {flags.map((flag) => (
                <span 
                    key={flag} 
                    className="text-[9px] font-semibold uppercase tracking-wider text-slate-500 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full"
                >
                    {flag.replace(/_/g, ' ')}
                </span>
            ))}
        </div>
    );
}
