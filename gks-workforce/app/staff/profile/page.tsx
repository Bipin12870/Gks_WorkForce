'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import StaffPageShell from '@/components/staff/StaffPageShell';
import StaffNavGroup from '@/components/staff/StaffNavGroup';
import StaffNavRow from '@/components/staff/StaffNavRow';
import Button from '@/components/ui/Button';
import { CalendarClock, FileText, User } from 'lucide-react';

export default function StaffProfilePage() {
    const { logout } = useAuth();
    const router = useRouter();

    const handleLogout = async () => {
        await logout();
        router.push('/login');
    };

    return (
        <StaffPageShell title="Profile" headerCentered scrollable>
            <StaffNavGroup title="Work">
                <StaffNavRow
                    href="/staff/profile/availability"
                    icon={CalendarClock}
                    label="Availability"
                    description="Weekly hours you can work"
                />
                <StaffNavRow
                    href="/staff/profile/timesheets"
                    icon={FileText}
                    label="Timesheets"
                    description="Submit and track worked hours"
                />
            </StaffNavGroup>

            <StaffNavGroup title="Account">
                <StaffNavRow
                    href="/staff/profile/details"
                    icon={User}
                    label="Personal details"
                    description="Your name on file"
                />
            </StaffNavGroup>

            <div className="pt-2 pb-1">
                <Button variant="ghost-danger" fullWidth onClick={handleLogout}>
                    Sign out
                </Button>
            </div>
        </StaffPageShell>
    );
}
