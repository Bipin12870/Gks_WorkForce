import { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';
import Icon from '@/components/ui/Icon';

type AlertVariant = 'success' | 'warning' | 'danger' | 'info';

interface StaffAlertProps {
    variant: AlertVariant;
    icon: LucideIcon;
    title: string;
    children?: ReactNode;
}

const variantStyles: Record<AlertVariant, { box: string; title: string }> = {
    success: { box: 'bg-green-50 border-green-200', title: 'text-green-800' },
    warning: { box: 'bg-amber-50 border-amber-200', title: 'text-amber-800' },
    danger: { box: 'bg-red-50 border-red-200', title: 'text-red-800' },
    info: { box: 'bg-blue-50 border-blue-200', title: 'text-blue-800' },
};

export default function StaffAlert({ variant, icon, title, children }: StaffAlertProps) {
    const styles = variantStyles[variant];
    return (
        <div className={`p-4 rounded-xl border flex gap-3 ${styles.box}`} role="status">
            <Icon icon={icon} size="md" className={`shrink-0 mt-0.5 ${styles.title}`} />
            <div className="min-w-0">
                <p className={`text-sm font-semibold ${styles.title}`}>{title}</p>
                {children && <div className="text-sm text-gray-600 mt-1 leading-relaxed">{children}</div>}
            </div>
        </div>
    );
}
