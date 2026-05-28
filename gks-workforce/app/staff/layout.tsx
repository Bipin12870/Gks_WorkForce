'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import StaffTabBar from '@/components/staff/StaffTabBar';
import PwaInstallPrompt from '@/components/staff/PwaInstallPrompt';

export default function StaffLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <ProtectedRoute requiredRole="STAFF">
            <div className="h-screen bg-background text-gray-900 flex flex-col pt-[env(safe-area-inset-top)] overflow-hidden">
                <div className="flex-1 min-h-0 flex flex-col pb-[calc(4.25rem+env(safe-area-inset-bottom))]">{children}</div>
                <StaffTabBar />
                <PwaInstallPrompt />
            </div>
        </ProtectedRoute>
    );
}
