'use client';

import { useAuth } from '@/contexts/AuthContext';
import StaffSubpageShell from '@/components/staff/StaffSubpageShell';

export default function StaffProfileDetailsPage() {
    const { userData } = useAuth();

    return (
        <StaffSubpageShell title="Personal details" scrollable>
            <div className="bg-white rounded-xl border border-gray-200">
                <div className="px-4 py-4">
                    <p className="text-label">Name</p>
                    <p className="text-sm font-medium text-gray-900 mt-1">{userData?.name ?? '—'}</p>
                </div>
            </div>
            <p className="text-xs text-gray-500 text-center mt-5 leading-relaxed">
                Contact your manager to update your details.
            </p>
        </StaffSubpageShell>
    );
}
