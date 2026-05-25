import { LucideIcon } from 'lucide-react';
import Icon from '@/components/ui/Icon';
import Badge from '@/components/ui/Badge';

interface AdminStatCardProps {
    label: string;
    value: string;
    subtext?: string;
    icon?: LucideIcon;
    variant?: 'default' | 'warning' | 'danger' | 'success';
    badge?: string;
    onClick?: () => void;
}

const accent: Record<string, string> = {
    default: 'border-l-blue-600',
    warning: 'border-l-amber-500',
    danger: 'border-l-red-600',
    success: 'border-l-green-600',
};

export default function AdminStatCard({
    label,
    value,
    subtext,
    icon,
    variant = 'default',
    badge,
    onClick,
}: AdminStatCardProps) {
    const Tag = onClick ? 'button' : 'div';
    return (
        <Tag
            type={onClick ? 'button' : undefined}
            onClick={onClick}
            className={`admin-stat-card ${accent[variant]} ${onClick ? 'admin-stat-card-interactive' : ''}`}
        >
            <div className="flex items-start justify-between gap-2">
                <p className="admin-kicker">{label}</p>
                {icon && (
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-50 text-gray-600 shrink-0">
                        <Icon icon={icon} size="sm" />
                    </span>
                )}
            </div>
            <p className="text-stat mt-2">{value}</p>
            {(subtext || badge) && (
                <div className="flex flex-wrap items-center gap-2 mt-2">
                    {subtext && <p className="text-label">{subtext}</p>}
                    {badge && <Badge variant={variant === 'danger' ? 'danger' : variant === 'warning' ? 'warning' : 'info'}>{badge}</Badge>}
                </div>
            )}
        </Tag>
    );
}
