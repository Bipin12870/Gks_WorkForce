'use client';

import Link from 'next/link';
import { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import Icon from '@/components/ui/Icon';

interface StaffSubpageShellProps {
    title: string;
    backHref?: string;
    /** Reserve space for StaffActionFooter (tab bar + action bar) */
    withActionFooter?: boolean;
    footer?: ReactNode;
    children: ReactNode;
}

export default function StaffSubpageShell({
    title,
    backHref = '/staff/profile',
    withActionFooter = false,
    footer,
    children,
}: StaffSubpageShellProps) {
    const hasFooter = Boolean(footer) || withActionFooter;

    return (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <header className="bg-white/95 backdrop-blur-sm border-b border-gray-200 shrink-0">
                <div className="max-w-lg mx-auto relative flex items-center justify-center min-h-14 px-14">
                    <Link
                        href={backHref}
                        className="absolute left-2 flex h-11 w-11 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 active:bg-gray-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        aria-label="Back to profile"
                    >
                        <Icon icon={ChevronLeft} size="md" />
                    </Link>
                    <h1 className="text-page-title text-center truncate px-1">{title}</h1>
                </div>
            </header>
            <main
                className={`flex-1 min-h-0 flex flex-col max-w-lg mx-auto w-full px-4 pt-4 overflow-hidden ${withActionFooter ? 'pb-[calc(5rem+env(safe-area-inset-bottom))]' : hasFooter ? 'pb-32' : ''}`}
            >
                {children}
            </main>
            {footer}
        </div>
    );
}
