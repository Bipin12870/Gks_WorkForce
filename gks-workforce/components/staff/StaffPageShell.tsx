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
        <>
            <header className="bg-white/95 backdrop-blur-sm border-b border-gray-200 sticky top-0 z-30">
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
                className={`${widthClass[maxWidth]} mx-auto px-4 py-6 ${centered ? 'flex flex-col items-center' : ''}`}
            >
                {children}
            </main>
        </>
    );
}
