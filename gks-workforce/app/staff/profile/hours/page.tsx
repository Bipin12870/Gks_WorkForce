'use client';

import StaffSubpageShell from '@/components/staff/StaffSubpageShell';
import StaffHoursSection from '@/components/StaffHoursSection';

export default function StaffProfileHoursPage() {
    return (
        <StaffSubpageShell title="Hours & pay">
            <StaffHoursSection />
        </StaffSubpageShell>
    );
}
