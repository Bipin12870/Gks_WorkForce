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
    const [flaggedCount, setFlaggedCount] = useState(0);
    const [todayShifts, setTodayShifts] = useState(0);

    useEffect(() => {
        if (!user || !userData) return;

        let unsubscribe = () => { };

        if (userData.role === 'ADMIN') {
            // All pending timesheets
            const qAll = query(
                collection(db, 'timesheets'),
                where('status', '==', 'PENDING')
            );

            // Specifically flagged timesheets
            const qFlagged = query(
                collection(db, 'timesheets'),
                where('status', '==', 'PENDING'),
                where('requiresAdminNote', '==', true)
            );

            const unsubAll = onSnapshot(qAll, (snapshot) => {
                setPendingTimesheets(snapshot.size);
            });

            const unsubFlagged = onSnapshot(qFlagged, (snapshot) => {
                setFlaggedCount(snapshot.size);
            });

            unsubscribe = () => {
                unsubAll();
                unsubFlagged();
            };
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
                <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-6">
                                <Logo width={110} height={36} />
                                <div className="border-l border-gray-200 pl-4 sm:pl-6">
                                    <h1 className="text-xl font-bold text-gray-900 tracking-tight">Workforce</h1>
                                    <p className="text-[10px] sm:text-xs text-gray-400 font-black uppercase tracking-widest">Hi {userData?.name}</p>
                                </div>
                            </div>
                            <button
                                onClick={handleLogout}
                                className="px-4 py-2 text-xs font-black uppercase tracking-widest text-gray-500 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-all border border-gray-100 shadow-sm"
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
                                {flaggedCount > 0 && (
                                    <DashboardCard
                                        title="Flagged Issues"
                                        description="Review geofence violations or overtime alerts"
                                        icon="⚠️"
                                        badgeCount={flaggedCount}
                                        isWarning
                                        onClick={() => handleNavigation('/admin/timesheets?filter=flagged')}
                                    />
                                )}
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
    isWarning?: boolean;
}

function DashboardCard({ title, description, icon, onClick, badgeCount, isWarning }: DashboardCardProps) {
    return (
        <button
            onClick={onClick}
            className={`relative flex flex-col p-6 text-left transition-all duration-200 border rounded-xl hover:shadow-sm group focus:ring-2 outline-none overflow-hidden ${isWarning
                    ? 'bg-amber-50/30 border-amber-200 hover:border-amber-500 focus:ring-amber-100'
                    : 'bg-white border-gray-200 hover:border-blue-500 focus:ring-blue-100'
                }`}
        >
            {badgeCount && badgeCount > 0 ? (
                <div className={`absolute top-4 right-4 flex items-center justify-center min-w-[20px] h-[20px] px-1.5 text-white text-[10px] font-black rounded-full shadow-sm ring-2 ring-white animate-in zoom-in duration-300 ${isWarning ? 'bg-amber-600' : 'bg-red-600'
                    }`}>
                    {badgeCount}
                </div>
            ) : null}
            <div className={`flex items-center justify-center w-12 h-12 mb-5 text-2xl rounded-lg transition-colors ${isWarning ? 'bg-amber-100 group-hover:bg-amber-200' : 'bg-gray-50 group-hover:bg-blue-50'
                }`}>
                {icon}
            </div>
            <h3 className={`text-base font-bold mb-1.5 transition-colors ${isWarning ? 'text-amber-900 group-hover:text-amber-700' : 'text-gray-900 group-hover:text-blue-600'
                }`}>
                {title}
            </h3>
            <p className={`text-sm leading-relaxed ${isWarning ? 'text-amber-700/70' : 'text-gray-500'
                }`}>{description}</p>
        </button>
    );
}
