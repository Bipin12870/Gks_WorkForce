'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import Logo from '@/components/Logo';
import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';

export default function DashboardPage() {
    const { userData, user, logout } = useAuth();
    const router = useRouter();
    const [pendingTimesheets, setPendingTimesheets] = useState(0);
    const [todayShifts, setTodayShifts] = useState(0);

    useEffect(() => {
        if (!user || !userData) return;

        let unsubscribe = () => {};

        if (userData.role === 'ADMIN') {
            const q = query(
                collection(db, 'timesheets'),
                where('status', '==', 'PENDING')
            );
            unsubscribe = onSnapshot(q, (snapshot) => {
                setPendingTimesheets(snapshot.size);
            });
        } else {
            const startOfToday = new Date();
            startOfToday.setHours(0, 0, 0, 0);
            const endOfToday = new Date();
            endOfToday.setHours(23, 59, 59, 999);

            const q = query(
                collection(db, 'shifts'),
                where('staffId', '==', user.uid),
                where('date', '>=', Timestamp.fromDate(startOfToday)),
                where('date', '<=', Timestamp.fromDate(endOfToday))
            );
            unsubscribe = onSnapshot(q, (snapshot) => {
                setTodayShifts(snapshot.size);
            });
        }

        return () => unsubscribe();
    }, [user, userData]);

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
                                <div className="border-l border-gray-200 pl-4 sm:pl-6">
                                    <h1 className="hidden sm:block text-lg font-bold text-gray-900 tracking-tight">Workforce</h1>
                                    <p className="text-[10px] sm:text-xs text-gray-500 font-medium whitespace-nowrap">Hi {userData?.name}</p>
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
                                    title="Time Clock"
                                    description="Clock in and out of your shift (GPS Required)"
                                    icon="📍"
                                    badgeCount={todayShifts}
                                    onClick={() => handleNavigation('/clock')}
                                />
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
                                    title="My Timesheets"
                                    description="Submit work hours for your shifts"
                                    icon="⏱️"
                                    onClick={() => handleNavigation('/staff/timesheets')}
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
                                    title="Timesheet Approval"
                                    description="Verify and approve staff timesheets"
                                    icon="✅"
                                    badgeCount={pendingTimesheets}
                                    onClick={() => handleNavigation('/admin/timesheets')}
                                />
                                <DashboardCard
                                    title="Hours Summary"
                                    description="View payroll and hours overview"
                                    icon="📈"
                                    onClick={() => handleNavigation('/admin/hours')}
                                />
                                <DashboardCard
                                    title="Settings"
                                    description="Configure shop location and geofence for GPS clock-in"
                                    icon="⚙️"
                                    onClick={() => handleNavigation('/admin/settings')}
                                />
                                <DashboardCard
                                    title="Analytics"
                                    description="Labor costs, hours summary, and performance metrics"
                                    icon="📊"
                                    onClick={() => handleNavigation('/admin/analytics')}
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
    badgeCount?: number;
}

function DashboardCard({ title, description, icon, onClick, badgeCount }: DashboardCardProps) {
    return (
        <button
            onClick={onClick}
            className="relative flex flex-col p-6 text-left transition-all duration-200 bg-white border border-gray-200 rounded-xl hover:border-blue-500 hover:shadow-sm group focus:ring-2 focus:ring-blue-100 outline-none overflow-hidden"
        >
            {badgeCount && badgeCount > 0 ? (
                <div className="absolute top-4 right-4 flex items-center justify-center min-w-[20px] h-[20px] px-1.5 bg-red-600 text-white text-[10px] font-black rounded-full shadow-sm ring-2 ring-white animate-in zoom-in duration-300">
                    {badgeCount}
                </div>
            ) : null}
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
