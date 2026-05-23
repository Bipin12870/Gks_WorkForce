'use client';

import StaffSubpageShell from '@/components/staff/StaffSubpageShell';
import StaffAvailabilitySection from '@/components/StaffAvailabilitySection';

export default function StaffProfileAvailabilityPage() {
    return (
        <StaffSubpageShell title="Availability" withActionFooter>
            <StaffAvailabilitySection />
        </StaffSubpageShell>
    );
}
