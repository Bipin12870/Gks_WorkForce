import {
    LayoutDashboard,
    CalendarRange,
    ClipboardCheck,
    DollarSign,
    Users,
    BarChart3,
    Settings,
    type LucideIcon,
} from 'lucide-react';

export interface AdminNavItem {
    href: string;
    label: string;
    icon: LucideIcon;
    /** Match pathname prefix for active state */
    match?: string;
}

export const ADMIN_NAV: AdminNavItem[] = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, match: '/dashboard' },
    { href: '/admin/roster', label: 'Roster', icon: CalendarRange, match: '/admin/roster' },
    { href: '/admin/timesheets', label: 'Timesheets', icon: ClipboardCheck, match: '/admin/timesheets' },
    { href: '/admin/hours', label: 'Hours & Pay', icon: DollarSign, match: '/admin/hours' },
    { href: '/admin/staff', label: 'Staff', icon: Users, match: '/admin/staff' },
    { href: '/admin/analytics', label: 'Analytics', icon: BarChart3, match: '/admin/analytics' },
    { href: '/admin/settings', label: 'Settings', icon: Settings, match: '/admin/settings' },
];

export function isAdminNavActive(pathname: string, item: AdminNavItem): boolean {
    const prefix = item.match ?? item.href;
    if (prefix === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(prefix);
}
