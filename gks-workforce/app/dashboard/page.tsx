'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import Logo from '@/components/Logo';

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
            <div className="min-h-screen bg-background">
                {/* Header */}
                <header className="bg-white border-b border-gray-200">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-6">
                                <Logo width={110} height={36} />
                                <div className="hidden sm:block border-l border-gray-200 pl-6">
                                    <h1 className="text-lg font-bold text-gray-900 tracking-tight">Workforce</h1>
                                    <p className="text-xs text-gray-500 font-medium">Signed in as {userData?.name}</p>
                                </div>
                            </div>
                            <button
                                onClick={handleLogout}
                                className="px-3 py-1.5 text-sm font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors border border-transparent hover:border-gray-200"
                            >
                                Sign Out
                            </button>
                        </div>
                    </div>
                </header>

                {/* Main Content */}
                <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {/* Staff Features */}
                        {userData?.role === 'STAFF' && (
                            <>
                                <DashboardCard
                                    title="My Availability"
                                    description="Set your weekly working hours"
                                    icon="📅"
                                    onClick={() => handleNavigation('/staff/availability')}
                                />
                                <DashboardCard
                                    title="My Roster"
                                    description="View your approved shifts and schedule"
                                    icon="📋"
                                    onClick={() => handleNavigation('/staff/roster')}
                                />
                                <DashboardCard
                                    title="Hours & Pay"
                                    description="Review your worked hours and estimated pay"
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
                                    description="Manage staff profiles and accounts"
                                    icon="👥"
                                    onClick={() => handleNavigation('/admin/staff')}
                                />
                                <DashboardCard
                                    title="Availability & Roster"
                                    description="Schedule shifts and approve availability"
                                    icon="📊"
                                    onClick={() => handleNavigation('/admin/roster')}
                                />
                                <DashboardCard
                                    title="Hours Summary"
                                    description="View payroll and hours overview"
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
            className="flex flex-col p-6 text-left transition-all duration-200 bg-white border border-gray-200 rounded-xl hover:border-blue-500 hover:shadow-sm group focus:ring-2 focus:ring-blue-100 outline-none"
        >
            <div className="flex items-center justify-center w-12 h-12 mb-5 text-2xl bg-gray-50 rounded-lg group-hover:bg-blue-50 transition-colors">
                {icon}
            </div>
            <h3 className="text-base font-bold text-gray-900 mb-1.5 group-hover:text-blue-600 transition-colors">
                {title}
            </h3>
            <p className="text-sm text-gray-500 leading-relaxed">{description}</p>
        </button>
    );
}
