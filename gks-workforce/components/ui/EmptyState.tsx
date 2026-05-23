import { LucideIcon } from 'lucide-react';
import Icon from './Icon';

interface EmptyStateProps {
    icon: LucideIcon;
    title: string;
    description?: string;
}

export default function EmptyState({ icon, title, description }: EmptyStateProps) {
    return (
        <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400">
                <Icon icon={icon} size="lg" />
            </div>
            <p className="text-section-title">{title}</p>
            {description && <p className="text-label mt-1 max-w-xs">{description}</p>}
        </div>
    );
}
