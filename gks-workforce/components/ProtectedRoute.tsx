'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { UserRole } from '@/types';

interface ProtectedRouteProps {
    children: React.ReactNode;
    requiredRole?: UserRole;
}

export default function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
    const { user, userData, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!loading) {
            if (!user) {
                router.push('/login');
            } else if (requiredRole && userData?.role !== requiredRole) {
                router.push('/unauthorized');
            }
        }
    }, [user, userData, loading, requiredRole, router]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    if (!user || (requiredRole && userData?.role !== requiredRole)) {
        return null;
    }

    return <>{children}</>;
}
