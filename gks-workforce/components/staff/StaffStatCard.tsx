import { ReactNode } from 'react';
import Card from '@/components/ui/Card';

interface StaffStatCardProps {
    label: string;
    value: ReactNode;
    suffix?: string;
    accent?: 'blue' | 'green' | 'gray';
    prefix?: string;
}

export default function StaffStatCard({ label, value, suffix, accent = 'blue', prefix }: StaffStatCardProps) {
    return (
        <Card borderAccent={accent} padding={false} className="p-4">
            <p className="text-label mb-1.5 leading-tight">{label}</p>
            <div className="flex items-baseline gap-0.5 flex-wrap">
                {prefix && <span className="text-xs font-medium text-gray-400">{prefix}</span>}
                <p className="text-lg font-semibold tabular-nums text-gray-900 leading-tight">{value}</p>
                {suffix && <span className="text-xs font-medium text-gray-400">{suffix}</span>}
            </div>
        </Card>
    );
}
