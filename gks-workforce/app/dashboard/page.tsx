'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Logo from '@/components/Logo';
import dynamic from 'next/dynamic';

const AdminDashboardWrapper = dynamic(() => import('@/components/admin/AdminDashboardWrapper'), {
    loading: () => <div className="p-8 text-center text-gray-500">Loading admin panel...</div>
});
const AdminOperationalDashboard = dynamic(() => import('@/components/admin/AdminOperationalDashboard'), {
    loading: () => <div className="p-8 text-center text-gray-500">Loading dashboard...</div>
});
import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase-db';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';
import Icon from '@/components/ui/Icon';
import { MapPin, Calendar, ClipboardList, Clock, DollarSign } from 'lucide-react';

export default function DashboardPage() {
    const { userData, user, logout, loading } = useAuth();
    const router = useRouter();
    const [todayShifts, setTodayShifts] = useState(0);

    useEffect(() => {
        if (!loading && userData?.role === 'STAFF') {
            router.replace('/staff/clock');
        }
    }, [userData, loading, router]);

    useEffect(() => {
        if (!user || !userData) return;
        if (userData.role === 'STAFF') return;

        let unsubscribe = () => { };

        if (userData.role === 'ADMIN') {
            return;
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

    if (userData?.role === 'ADMIN') {
        return (
            <AdminDashboardWrapper>
                <AdminOperationalDashboard />
            </AdminDashboardWrapper>
        );
    }

    return (
        <ProtectedRoute>
            <div className="min-h-screen bg-background">
                <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-6">
                                <Link href="/dashboard">
                                    <Logo size={36} />
                                </Link>
                                <div className="border-l border-gray-200 pl-4 sm:pl-6">
                                    <h1 className="text-page-title">Workforce</h1>
                                    <p className="text-label mt-0.5">Hi {userData?.name}</p>
                                </div>
                            </div>
                            <button
                                onClick={handleLogout}
                                className="btn-secondary text-xs"
                            >
                                Sign Out
                            </button>
                        </div>
                    </div>
                </header>

                <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {userData?.role === 'STAFF' && (
                            <>
                                <DashboardCard
                                    title="Time Clock"
                                    description="Clock in and out of your shift (GPS Required)"
                                    icon={MapPin}
                                    badgeCount={todayShifts}
                                    onClick={() => handleNavigation('/staff/clock')}
                                />
                                <DashboardCard
                                    title="My Availability"
                                    description="Set your weekly working hours"
                                    icon={Calendar}
                                    onClick={() => handleNavigation('/staff/profile/availability')}
                                />
                                <DashboardCard
                                    title="My Roster"
                                    description="View your approved shifts and schedule"
                                    icon={ClipboardList}
                                    onClick={() => handleNavigation('/staff/roster')}
                                />
                                <DashboardCard
                                    title="My Timesheets"
                                    description="Submit work hours for your shifts"
                                    icon={Clock}
                                    onClick={() => handleNavigation('/staff/timesheets')}
                                />
                                <DashboardCard
                                    title="Hours & Pay"
                                    description="Review your worked hours and estimated pay"
                                    icon={DollarSign}
                                    onClick={() => handleNavigation('/staff/profile')}
                                />
                            </>
                        )}
                    </div>
                </main>
            </div>
        </ProtectedRoute>
    );
}

import type { LucideIcon } from 'lucide-react';

interface DashboardCardProps {
    title: string;
    description: string;
    icon: LucideIcon;
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
                <div className={`absolute top-4 right-4 flex items-center justify-center min-w-[20px] h-[20px] px-1.5 text-white text-[10px] font-semibold rounded-full shadow-sm ring-2 ring-white animate-in zoom-in duration-300 ${isWarning ? 'bg-amber-600' : 'bg-red-600'
                    }`}>
                    {badgeCount}
                </div>
            ) : null}
            <div className={`flex items-center justify-center w-12 h-12 mb-5 rounded-lg transition-colors ${isWarning ? 'bg-amber-100 text-amber-600 group-hover:bg-amber-200' : 'bg-gray-50 text-blue-600 group-hover:bg-blue-50'
                }`}>
                <Icon icon={icon} size="md" />
            </div>
            <h3 className={`text-base font-semibold mb-1.5 transition-colors ${isWarning ? 'text-amber-900 group-hover:text-amber-700' : 'text-gray-900 group-hover:text-blue-600'
                }`}>
                {title}
            </h3>
            <p className={`text-sm leading-relaxed ${isWarning ? 'text-amber-700/70' : 'text-gray-500'
                }`}>{description}</p>
        </button>
    );
}
