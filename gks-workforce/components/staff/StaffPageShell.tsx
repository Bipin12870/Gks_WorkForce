import { ReactNode } from 'react';

type MaxWidth = 'md' | 'lg' | 'xl';

const widthClass: Record<MaxWidth, string> = {
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
};

interface StaffPageShellProps {
    title: string;
    description?: string;
    maxWidth?: MaxWidth;
    centered?: boolean;
    /** Center-align header title and optional description (mobile app style) */
    headerCentered?: boolean;
    children: ReactNode;
}

export default function StaffPageShell({
    title,
    description,
    maxWidth = 'lg',
    centered = false,
    headerCentered = true,
    children,
}: StaffPageShellProps) {
    return (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <header className="bg-white/95 backdrop-blur-sm border-b border-gray-200 shrink-0">
                <div
                    className={`${widthClass[maxWidth]} mx-auto px-4 min-h-14 flex flex-col justify-center py-3 ${
                        headerCentered ? 'text-center' : ''
                    }`}
                >
                    <h1 className="text-page-title">{title}</h1>
                    {description && <p className="text-label mt-0.5">{description}</p>}
                </div>
            </header>
            <main
                className={`flex-1 min-h-0 flex flex-col ${widthClass[maxWidth]} w-full mx-auto px-4 py-5 ${
                    centered ? 'items-center' : ''
                } overflow-hidden`}
            >
                {children}
            </main>
        </div>
    );
}
