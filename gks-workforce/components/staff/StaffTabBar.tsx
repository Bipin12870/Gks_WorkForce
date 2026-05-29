'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Clock, CalendarDays, Coins, User } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query, Timestamp, where } from 'firebase/firestore';
import Icon from '@/components/ui/Icon';

const TABS = [
    { href: '/staff/clock', label: 'Clock', icon: Clock },
    { href: '/staff/roster', label: 'Roster', icon: CalendarDays },
    { href: '/staff/hours', label: 'Hours', icon: Coins },
    { href: '/staff/profile', label: 'Profile', icon: User },
] as const;

export default function StaffTabBar() {
    const pathname = usePathname();
    const { user } = useAuth();
    const [todayShifts, setTodayShifts] = useState(0);
    const [profileHref, setProfileHref] = useState('/staff/profile');

    useEffect(() => {
        try {
            const saved = localStorage.getItem('last_staff_profile_path');
            if (saved && saved.startsWith('/staff/profile') && /^\/staff\/profile[a-zA-Z0-9\/\-_]*$/.test(saved)) {
                // eslint-disable-next-line react-hooks/set-state-in-effect
                setProfileHref(saved);
            }
        } catch {
            // Ignore
        }
    }, []);

    useEffect(() => {
        if (pathname.startsWith('/staff/profile')) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setProfileHref(pathname);
            try {
                localStorage.setItem('last_staff_profile_path', pathname);
            } catch {
                // Ignore
            }
        }
    }, [pathname]);

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
            className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-gray-200 pt-2 pb-[calc(30px+env(safe-area-inset-bottom))]"
            aria-label="Staff navigation"
        >
            <div className="max-w-lg mx-auto flex">
                {TABS.map((tab) => {
                    const isActive =
                        pathname === tab.href ||
                        (tab.href === '/staff/profile' && pathname.startsWith('/staff/profile'));

                    const href = tab.href === '/staff/profile'
                        ? (isActive ? '/staff/profile' : (profileHref.startsWith('/staff/profile') ? profileHref : '/staff/profile'))
                        : tab.href;

                    return (
                        <Link
                            key={tab.href}
                            href={href}
                            aria-current={isActive ? 'page' : undefined}
                            className="relative flex-1 flex flex-col items-center justify-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
                        >
                            <div className={`flex flex-col items-center gap-0.5 relative pb-1 px-1 transition-all active:scale-95 ${
                                isActive ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'
                            }`}>
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
                                <span className={`text-[10px] sm:text-xs font-semibold ${isActive ? 'text-blue-600' : 'text-gray-500'}`}>
                                    {tab.label}
                                </span>
                                {isActive && (
                                    <span
                                        className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-blue-600 rounded-full motion-reduce:hidden animate-in fade-in zoom-in-75 duration-200"
                                        aria-hidden
                                    />
                                )}
                            </div>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
