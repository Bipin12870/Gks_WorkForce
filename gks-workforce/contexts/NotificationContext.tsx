'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import Icon from '@/components/ui/Icon';

type NotificationType = 'success' | 'error';

interface Notification {
    message: string;
    type: NotificationType;
}

interface NotificationContextType {
    showNotification: (message: string, type: NotificationType) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const useNotification = () => {
    const context = useContext(NotificationContext);
    if (!context) {
        throw new Error('useNotification must be used within a NotificationProvider');
    }
    return context;
};

export function NotificationProvider({ children }: { children: React.ReactNode }) {
    const [notification, setNotification] = useState<Notification | null>(null);
    const pathname = usePathname();
    const isStaffRoute = pathname?.startsWith('/staff');

    const showNotification = useCallback((message: string, type: NotificationType) => {
        setNotification({ message, type });
    }, []);

    useEffect(() => {
        if (notification) {
            const timer = setTimeout(() => {
                setNotification(null);
            }, 2000);
            return () => clearTimeout(timer);
        }
    }, [notification]);

    return (
        <NotificationContext.Provider value={{ showNotification }}>
            {children}
            {notification && (
                <div
                    className={`fixed z-[9999] left-4 right-4 md:left-auto md:right-6 md:w-full md:max-w-sm ${
                        isStaffRoute
                            ? 'bottom-28 pb-[env(safe-area-inset-bottom)] animate-toast-up'
                            : 'top-6 pt-[env(safe-area-inset-top)] animate-toast-down'
                    }`}
                    role="status"
                    aria-live="polite"
                >
                    <div
                        className="px-4 py-2.5 rounded-xl shadow-xl border border-slate-800 flex items-center gap-3 w-full bg-slate-950/95 backdrop-blur-md text-slate-100"
                    >
                        <div className="shrink-0">
                            <Icon
                                icon={notification.type === 'success' ? CheckCircle2 : AlertCircle}
                                size="sm"
                                className={notification.type === 'success' ? 'text-emerald-400' : 'text-rose-400'}
                            />
                        </div>
                        <span className="text-xs font-medium leading-normal tracking-tight">
                            {notification.type === 'error' && !notification.message.startsWith('Error') ? `Error: ${notification.message}` : notification.message}
                        </span>
                    </div>
                </div>
            )}
        </NotificationContext.Provider>
    );
}
