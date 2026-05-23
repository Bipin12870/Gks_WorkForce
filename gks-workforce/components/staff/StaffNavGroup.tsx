import { ReactNode } from 'react';

interface StaffNavGroupProps {
    title: string;
    children: ReactNode;
    className?: string;
}

export default function StaffNavGroup({ title, children, className = '' }: StaffNavGroupProps) {
    return (
        <section className={`mb-6 ${className}`}>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 mb-2">{title}</h2>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden divide-y divide-gray-100">
                {children}
            </div>
        </section>
    );
}
