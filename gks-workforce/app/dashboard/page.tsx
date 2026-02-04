'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

export default function DashboardPage() {
    const { userData, logout } = useAuth();
    const router = useRouter();

    const handleLogout = async () => {
        await logout();
        router.push('/login');
    };

    const handleNavigation = (path: string) => {
        router.push(path);
    };

    return (
        <ProtectedRoute>
            <div className="min-h-screen bg-gray-50">
                {/* Header */}
                <header className="bg-white shadow-sm border-b">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                        <div className="flex justify-between items-center">
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900">GKS Workforce</h1>
                                <p className="text-sm text-gray-600">Welcome, {userData?.name}</p>
                            </div>
                            <button
                                onClick={handleLogout}
                                className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition"
                            >
                                Logout
                            </button>
                        </div>
                    </div>
                </header>

                {/* Main Content */}
                <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {/* Staff Features */}
                        {userData?.role === 'STAFF' && (
                            <>
                                <DashboardCard
                                    title="My Availability"
                                    description="Set your weekly availability"
                                    icon="📅"
                                    onClick={() => handleNavigation('/staff/availability')}
                                />
                                <DashboardCard
                                    title="My Roster"
                                    description="View your approved shifts"
                                    icon="📋"
                                    onClick={() => handleNavigation('/staff/roster')}
                                />
                                <DashboardCard
                                    title="Hours & Pay"
                                    description="View your worked hours and pay"
                                    icon="💰"
                                    onClick={() => handleNavigation('/staff/hours')}
                                />
                            </>
                        )}

                        {/* Admin Features */}
                        {userData?.role === 'ADMIN' && (
                            <>
                                <DashboardCard
                                    title="Staff Management"
                                    description="Create and manage staff accounts"
                                    icon="👥"
                                    onClick={() => handleNavigation('/admin/staff')}
                                />
                                <DashboardCard
                                    title="Availability & Roster"
                                    description="View availability and approve shifts"
                                    icon="📊"
                                    onClick={() => handleNavigation('/admin/roster')}
                                />
                                <DashboardCard
                                    title="Hours Summary"
                                    description="View staff hours and pay"
                                    icon="📈"
                                    onClick={() => handleNavigation('/admin/hours')}
                                />
                            </>
                        )}
                    </div>
                </main>
            </div>
        </ProtectedRoute>
    );
}

interface DashboardCardProps {
    title: string;
    description: string;
    icon: string;
    onClick: () => void;
}

function DashboardCard({ title, description, icon, onClick }: DashboardCardProps) {
    return (
        <button
            onClick={onClick}
            className="bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition-shadow border border-gray-200 text-left group"
        >
            <div className="text-4xl mb-4">{icon}</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2 group-hover:text-blue-600 transition">
                {title}
            </h3>
            <p className="text-sm text-gray-600">{description}</p>
        </button>
    );
}
