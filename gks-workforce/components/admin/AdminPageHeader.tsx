import { ReactNode } from 'react';

interface AdminPageHeaderProps {
    title: string;
    description?: string;
    actions?: ReactNode;
}

export default function AdminPageHeader({ title, description, actions }: AdminPageHeaderProps) {
    return (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-6">
            <div className="min-w-0">
                <h1 className="text-page-title">{title}</h1>
                {description && <p className="text-sm text-gray-500 mt-1 max-w-2xl">{description}</p>}
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
        </div>
    );
}
