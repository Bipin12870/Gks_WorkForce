'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import StaffTabBar from '@/components/staff/StaffTabBar';

export default function StaffLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <ProtectedRoute requiredRole="STAFF">
            <div className="min-h-screen bg-background text-gray-900 flex flex-col pt-[env(safe-area-inset-top)]">
                <div className="flex-1 pb-24 min-h-0">{children}</div>
                <StaffTabBar />
            </div>
        </ProtectedRoute>
    );
}
