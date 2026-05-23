'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Clock, CalendarDays, FileText, User } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query, Timestamp, where } from 'firebase/firestore';
import Icon from '@/components/ui/Icon';

const TABS = [
    { href: '/staff/clock', label: 'Clock', icon: Clock },
    { href: '/staff/roster', label: 'Roster', icon: CalendarDays },
    { href: '/staff/timesheets', label: 'Sheets', icon: FileText },
    { href: '/staff/profile', label: 'Profile', icon: User },
] as const;

export default function StaffTabBar() {
    const pathname = usePathname();
    const { user } = useAuth();
    const [todayShifts, setTodayShifts] = useState(0);

    useEffect(() => {
        if (!user) return;

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

        const unsubscribe = onSnapshot(q, (snapshot) => {
            setTodayShifts(snapshot.size);
        });

        return () => unsubscribe();
    }, [user]);

    return (
        <nav
            className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-gray-200 pb-[env(safe-area-inset-bottom)]"
            aria-label="Staff navigation"
        >
            <div className="max-w-lg mx-auto flex">
                {TABS.map((tab) => {
                    const isActive =
                        pathname === tab.href ||
                        (tab.href === '/staff/profile' && pathname.startsWith('/staff/profile'));

                    return (
                        <Link
                            key={tab.href}
                            href={tab.href}
                            aria-current={isActive ? 'page' : undefined}
                            className={`relative flex-1 flex flex-col items-center justify-center gap-1 min-h-14 py-2 px-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${
                                isActive ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'
                            }`}
                        >
                            <span className="relative">
                                <Icon
                                    icon={tab.icon}
                                    size="md"
                                    className={isActive ? 'text-blue-600' : 'text-gray-400'}
                                />
                                {tab.href === '/staff/clock' && todayShifts > 0 && (
                                    <span
                                        className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-blue-600 rounded-full"
                                        aria-hidden
                                    />
                                )}
                            </span>
                            <span className={`text-xs font-medium ${isActive ? 'text-blue-600' : 'text-gray-500'}`}>
                                {tab.label}
                            </span>
                            {isActive && (
                                <span
                                    className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-blue-600 rounded-full motion-reduce:hidden"
                                    aria-hidden
                                />
                            )}
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
