'use client';

import StaffPageShell from '@/components/staff/StaffPageShell';
import StaffHoursSection from '@/components/StaffHoursSection';

export default function StaffHoursPage() {
    return (
        <StaffPageShell title="Hours & pay">
            <StaffHoursSection />
        </StaffPageShell>
    );
}
