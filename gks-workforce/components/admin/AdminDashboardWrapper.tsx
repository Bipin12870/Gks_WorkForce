'use client';

import { ReactNode } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import AdminShell from '@/components/admin/AdminShell';

/** Wraps admin dashboard content with shell + auth (dashboard lives outside /admin). */
export default function AdminDashboardWrapper({ children }: { children: ReactNode }) {
    return (
        <ProtectedRoute requiredRole="ADMIN">
            <AdminShell>{children}</AdminShell>
        </ProtectedRoute>
    );
}
