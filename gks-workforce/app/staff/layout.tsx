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

        const preventTouchMove = (e: TouchEvent) => {
            let isScrollable = false;
            let target = e.target as Element | null;
            while (target && target !== document.body) {
                const style = window.getComputedStyle(target);
                const overflowX = style.overflowX;
                const overflowY = style.overflowY;
                if (target instanceof HTMLElement) {
                    const hasScrollableHeight = (overflowY === 'auto' || overflowY === 'scroll') && target.scrollHeight > target.clientHeight;
                    const hasScrollableWidth = (overflowX === 'auto' || overflowX === 'scroll') && target.scrollWidth > target.clientWidth;
                    if (hasScrollableHeight || hasScrollableWidth) {
                        isScrollable = true;
                        break;
                    }
                }
                target = target.parentElement;
            }
            if (!isScrollable) {
                if (e.cancelable) {
                    e.preventDefault();
                }
            }
        };

        document.addEventListener('touchmove', preventTouchMove, { passive: false });

        return () => {
            document.documentElement.classList.remove('staff-scroll-lock');
            document.body.classList.remove('staff-scroll-lock');
            document.removeEventListener('touchmove', preventTouchMove);
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
