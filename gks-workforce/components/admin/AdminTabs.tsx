'use client';

interface AdminTab {
    id: string;
    label: string;
    count?: number;
}

interface AdminTabsProps {
    tabs: AdminTab[];
    activeId: string;
    onChange: (id: string) => void;
    className?: string;
}

export default function AdminTabs({ tabs, activeId, onChange, className = '' }: AdminTabsProps) {
    return (
        <div className={`flex border-b border-gray-100 overflow-x-auto ${className}`} role="tablist">
            {tabs.map((tab) => {
                const active = tab.id === activeId;
                return (
                    <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => onChange(tab.id)}
                        className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors min-h-11 ${
                            active
                                ? 'border-blue-500 text-blue-600'
                                : 'border-transparent text-gray-400 hover:text-gray-700'
                        }`}
                    >
                        {tab.label}
                        {tab.count !== undefined && (
                            <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                                active ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'
                            }`}>
                                {tab.count}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
