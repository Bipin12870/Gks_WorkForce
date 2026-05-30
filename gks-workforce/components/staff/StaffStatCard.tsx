import { ReactNode } from 'react';
import Card from '@/components/ui/Card';
import Icon from '@/components/ui/Icon';
import { LucideIcon } from 'lucide-react';

interface StaffStatCardProps {
    label: string;
    value: ReactNode;
    suffix?: string;
    accent?: 'blue' | 'green' | 'gray';
    prefix?: string;
    icon?: LucideIcon;
}

export default function StaffStatCard({ label, value, suffix, accent = 'blue', prefix, icon }: StaffStatCardProps) {
    const valueColor = {
        blue: 'text-blue-600',
        green: 'text-green-600',
        gray: 'text-gray-900',
    }[accent];

    return (
        <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-100 flex flex-col justify-center">
            <div className="flex items-center gap-1.5 mb-1.5 text-slate-500">
                {icon && <Icon icon={icon} size="sm" />}
                <p className="text-sm font-medium">{label}</p>
            </div>
            <div className="flex items-baseline gap-0.5 flex-wrap">
                {prefix && <span className={`text-xl font-bold ${valueColor}`}>{prefix}</span>}
                <p className={`text-2xl font-bold tabular-nums leading-tight ${valueColor}`}>{value}</p>
                {suffix && <span className={`text-xl font-bold ${valueColor}`}>{suffix}</span>}
            </div>
        </div>
    );
}
