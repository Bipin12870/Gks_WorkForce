'use client';

import Link from 'next/link';
import { ChevronRight, LucideIcon } from 'lucide-react';
import Icon from '@/components/ui/Icon';

interface StaffNavRowProps {
    href?: string;
    onClick?: () => void;
    icon: LucideIcon;
    label: string;
    description?: string;
    disabled?: boolean;
    badge?: string;
}

export default function StaffNavRow({
    href,
    onClick,
    icon,
    label,
    description,
    disabled = false,
    badge,
}: StaffNavRowProps) {
    const content = (
        <>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600">
                <Icon icon={icon} size="md" className={disabled ? 'text-gray-300' : ''} />
            </div>
            <div className="flex-1 min-w-0 text-left">
                <p className={`text-sm font-medium ${disabled ? 'text-gray-400' : 'text-gray-900'}`}>{label}</p>
                {description && <p className="text-xs text-gray-500 mt-0.5 truncate">{description}</p>}
            </div>
            {badge ? (
                <span className="text-xs font-medium text-gray-400 shrink-0">{badge}</span>
            ) : !disabled ? (
                <Icon icon={ChevronRight} size="sm" className="text-gray-300 shrink-0" />
            ) : null}
        </>
    );

    const className = `flex items-center gap-3 w-full min-h-[52px] px-4 py-3 transition-all active:scale-[0.98] duration-150 ${
        disabled
            ? 'cursor-not-allowed opacity-70'
            : 'hover:bg-gray-50 active:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500'
    }`;

    if (disabled || (!href && !onClick)) {
        return <div className={className}>{content}</div>;
    }

    if (href) {
        return (
            <Link href={href} className={className}>
                {content}
            </Link>
        );
    }

    return (
        <button type="button" onClick={onClick} className={className}>
            {content}
        </button>
    );
}
