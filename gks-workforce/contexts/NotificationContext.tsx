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
            }, 5000);
            return () => clearTimeout(timer);
        }
    }, [notification]);

    return (
        <NotificationContext.Provider value={{ showNotification }}>
            {children}
            {notification && (
                <div
                    className={`fixed left-1/2 -translate-x-1/2 z-[9999] w-full max-w-[90%] md:max-w-md ${
                        isStaffRoute
                            ? 'bottom-24 pb-[env(safe-area-inset-bottom)]'
                            : 'top-6 pt-[env(safe-area-inset-top)]'
                    }`}
                    role="status"
                    aria-live="polite"
                >
                    <div
                        className={`px-4 py-3 rounded-xl shadow-md border flex items-center gap-3 w-full ${
                            notification.type === 'success'
                                ? 'bg-green-50 border-green-200 text-green-800'
                                : 'bg-red-50 border-red-200 text-red-800'
                        }`}
                    >
                        <Icon
                            icon={notification.type === 'success' ? CheckCircle2 : AlertCircle}
                            size="md"
                            className={notification.type === 'success' ? 'text-green-500' : 'text-red-500'}
                        />
                        <span className="text-sm font-medium">{notification.message}</span>
                    </div>
                </div>
            )}
        </NotificationContext.Provider>
    );
}
