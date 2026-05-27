import { ReactNode } from 'react';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

interface BadgeProps {
    variant?: BadgeVariant;
    children: ReactNode;
    className?: string;
}

const variantClass: Record<BadgeVariant, string> = {
    success: 'bg-green-50 text-green-700 border-green-100',
    warning: 'bg-amber-50 text-amber-700 border-amber-100',
    danger: 'bg-red-50 text-red-700 border-red-100',
    info: 'bg-blue-50 text-blue-700 border-blue-100',
    neutral: 'bg-gray-50 text-gray-600 border-gray-100',
};

export default function Badge({ variant = 'neutral', children, className = '' }: BadgeProps) {
    return (
        <span
            className={`inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-medium rounded-full border ${variantClass[variant]} ${className}`}
        >
            {children}
        </span>
    );
}
