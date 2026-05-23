import { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';
import Icon from '@/components/ui/Icon';

interface StaffListRowProps {
    icon?: LucideIcon;
    iconClassName?: string;
    title: ReactNode;
    subtitle?: ReactNode;
    meta?: ReactNode;
    trailing?: ReactNode;
    banner?: ReactNode;
}

export default function StaffListRow({
    icon,
    iconClassName = 'text-gray-400',
    title,
    subtitle,
    meta,
    trailing,
    banner,
}: StaffListRowProps) {
    return (
        <div className="card-base overflow-hidden">
            {banner}
            <div className="p-4 sm:p-5 flex items-start sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                    {icon && (
                        <div className="shrink-0 flex h-10 w-10 items-center justify-center rounded-lg border border-gray-100 bg-gray-50">
                            <Icon icon={icon} size="md" className={iconClassName} />
                        </div>
                    )}
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">{title}</div>
                        {subtitle && <div className="mt-1">{subtitle}</div>}
                        {meta && <div className="mt-1.5 flex flex-wrap items-center gap-2">{meta}</div>}
                    </div>
                </div>
                {trailing && <div className="shrink-0 text-right">{trailing}</div>}
            </div>
        </div>
    );
}
