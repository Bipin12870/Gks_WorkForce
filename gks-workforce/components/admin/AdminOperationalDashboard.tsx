'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import AdminStatCard from '@/components/admin/AdminStatCard';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Icon from '@/components/ui/Icon';
import {
    AlertTriangle,
    CalendarRange,
    ClipboardCheck,
    Clock,
    DollarSign,
    Settings,
    Users,
    BarChart3,
    ArrowRight,
} from 'lucide-react';

interface QuickLink {
    title: string;
    description: string;
    href: string;
    icon: typeof CalendarRange;
    badge?: number;
    priority?: 'default' | 'warning' | 'danger';
}

export default function AdminOperationalDashboard() {
    const router = useRouter();
    const [pendingTimesheets, setPendingTimesheets] = useState(0);
    const [flaggedCount, setFlaggedCount] = useState(0);
    const [todayShifts, setTodayShifts] = useState(0);

    useEffect(() => {
        const qAll = query(collection(db, 'timesheets'), where('status', '==', 'PENDING'));
        const qFlagged = query(
            collection(db, 'timesheets'),
            where('status', '==', 'PENDING'),
            where('requiresAdminNote', '==', true)
        );

        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const endOfToday = new Date();
        endOfToday.setHours(23, 59, 59, 999);
        const qShifts = query(
            collection(db, 'shifts'),
            where('status', '==', 'APPROVED'),
            where('date', '>=', Timestamp.fromDate(startOfToday)),
            where('date', '<=', Timestamp.fromDate(endOfToday))
        );

        const unsubPending = onSnapshot(qAll, (s) => setPendingTimesheets(s.size));
        const unsubFlagged = onSnapshot(qFlagged, (s) => setFlaggedCount(s.size));
        const unsubShifts = onSnapshot(qShifts, (s) => setTodayShifts(s.size));

        return () => {
            unsubPending();
            unsubFlagged();
            unsubShifts();
        };
    }, []);

    const actionQueue: QuickLink[] = [];
    if (flaggedCount > 0) {
        actionQueue.push({
            title: 'Review flagged timesheets',
            description: 'GPS, overtime, or policy exceptions need attention',
            href: '/admin/timesheets?filter=flagged',
            icon: AlertTriangle,
            badge: flaggedCount,
            priority: 'danger',
        });
    }
    if (pendingTimesheets > 0) {
        actionQueue.push({
            title: 'Approve pending timesheets',
            description: `${pendingTimesheets} submission${pendingTimesheets !== 1 ? 's' : ''} awaiting review`,
            href: '/admin/timesheets?filter=pending',
            icon: ClipboardCheck,
            badge: pendingTimesheets,
            priority: flaggedCount > 0 ? 'default' : 'warning',
        });
    }
    actionQueue.push({
        title: 'Manage roster & availability',
        description: 'Schedule shifts against staff availability',
        href: '/admin/roster',
        icon: CalendarRange,
    });

    const modules: QuickLink[] = [
        { title: 'Staff', description: 'Profiles, rates, access', href: '/admin/staff', icon: Users },
        { title: 'Hours & Pay', description: 'Weekly labor summary', href: '/admin/hours', icon: DollarSign },
        { title: 'Analytics', description: 'Trends and labor metrics', href: '/admin/analytics', icon: BarChart3 },
        { title: 'Settings', description: 'Shop location & geofence', href: '/admin/settings', icon: Settings },
    ];

    return (
        <>
            <AdminPageHeader
                title="Operations"
                description="Prioritized queue for roster, timesheets, and payroll decisions."
            />

            <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8" aria-label="Key metrics">
                <AdminStatCard
                    label="Pending approvals"
                    value={String(pendingTimesheets)}
                    subtext="Timesheets to review"
                    icon={ClipboardCheck}
                    variant={pendingTimesheets > 0 ? 'warning' : 'default'}
                    onClick={() => router.push('/admin/timesheets?filter=pending')}
                />
                <AdminStatCard
                    label="Flagged issues"
                    value={String(flaggedCount)}
                    subtext="Requires admin note"
                    icon={AlertTriangle}
                    variant={flaggedCount > 0 ? 'danger' : 'default'}
                    onClick={() => router.push('/admin/timesheets?filter=flagged')}
                />
                <AdminStatCard
                    label="Shifts today"
                    value={String(todayShifts)}
                    subtext="Approved on roster"
                    icon={Clock}
                    variant="success"
                    onClick={() => router.push('/admin/roster')}
                />
                <AdminStatCard
                    label="Roster"
                    value="Open"
                    subtext="Availability & shifts"
                    icon={CalendarRange}
                    onClick={() => router.push('/admin/roster')}
                />
            </section>

            <section className="mb-8">
                <h2 className="text-section-title mb-3">Action queue</h2>
                <div className="space-y-2">
                    {actionQueue.map((item) => (
                        <button
                            key={item.href + item.title}
                            type="button"
                            onClick={() => router.push(item.href)}
                            className={`admin-action-row ${
                                item.priority === 'danger'
                                    ? 'admin-action-row-danger'
                                    : item.priority === 'warning'
                                      ? 'admin-action-row-warning'
                                      : ''
                            }`}
                        >
                            <span
                                className={`flex h-10 w-10 items-center justify-center rounded-lg shrink-0 ${
                                    item.priority === 'danger'
                                        ? 'bg-red-50 text-red-700'
                                        : item.priority === 'warning'
                                          ? 'bg-amber-50 text-amber-700'
                                          : 'bg-blue-50 text-blue-700'
                                }`}
                            >
                                <Icon icon={item.icon} size="sm" />
                            </span>
                            <span className="flex-1 min-w-0 text-left">
                                <span className="text-sm font-semibold text-gray-900 block">{item.title}</span>
                                <span className="text-label block truncate">{item.description}</span>
                            </span>
                            {item.badge !== undefined && item.badge > 0 && (
                                <Badge variant={item.priority === 'danger' ? 'danger' : 'warning'}>{item.badge}</Badge>
                            )}
                            <Icon icon={ArrowRight} size="sm" className="text-gray-400 shrink-0" />
                        </button>
                    ))}
                </div>
            </section>

            <section>
                <h2 className="text-section-title mb-3">Modules</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {modules.map((m) => (
                        <Card
                            key={m.href}
                            className="p-4 hover:border-blue-300 transition-colors cursor-pointer"
                            onClick={() => router.push(m.href)}
                        >
                            <div className="flex items-start gap-3">
                                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-50 text-gray-700">
                                    <Icon icon={m.icon} size="sm" />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold text-gray-900">{m.title}</p>
                                    <p className="text-label mt-0.5">{m.description}</p>
                                </div>
                                <Icon icon={ArrowRight} size="sm" className="text-gray-300 shrink-0" />
                            </div>
                        </Card>
                    ))}
                </div>
            </section>
        </>
    );
}
