'use client';

import { useEffect } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import StaffTabBar from '@/components/staff/StaffTabBar';
import PwaInstallPrompt from '@/components/staff/PwaInstallPrompt';

export default function StaffLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    useEffect(() => {
        document.documentElement.classList.add('staff-scroll-lock');
        document.body.classList.add('staff-scroll-lock');
        return () => {
            document.documentElement.classList.remove('staff-scroll-lock');
            document.body.classList.remove('staff-scroll-lock');
        };
    }, []);

    return (
        <ProtectedRoute requiredRole="STAFF">
            <div className="h-screen bg-background text-gray-900 flex flex-col pt-[env(safe-area-inset-top)] overflow-hidden">
                <div className="flex-1 min-h-0 flex flex-col pb-[calc(5rem+env(safe-area-inset-bottom))]">{children}</div>
                <StaffTabBar />
                <PwaInstallPrompt />
            </div>
        </ProtectedRoute>
    );
}
