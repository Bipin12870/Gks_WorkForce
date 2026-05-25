'use client';

import { ReactNode } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import AdminShell from '@/components/admin/AdminShell';

export default function AdminLayout({ children }: { children: ReactNode }) {
    return (
        <ProtectedRoute requiredRole="ADMIN">
            <AdminShell>{children}</AdminShell>
        </ProtectedRoute>
    );
}
