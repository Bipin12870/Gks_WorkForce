import { ReactNode } from 'react';

interface AdminPageHeaderProps {
    description?: string;
    actions?: ReactNode;
}

export default function AdminPageHeader({ description, actions }: AdminPageHeaderProps) {
    return (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-6">
            <div className="min-w-0">
                {description && <p className="text-sm text-gray-400 font-normal mt-0.5 max-w-2xl">{description}</p>}
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
        </div>
    );
}
