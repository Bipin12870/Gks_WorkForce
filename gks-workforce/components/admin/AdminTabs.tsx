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
        <div className={`admin-tabs ${className}`} role="tablist">
            {tabs.map((tab) => {
                const active = tab.id === activeId;
                return (
                    <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => onChange(tab.id)}
                        className={`admin-tab ${active ? 'admin-tab-active' : ''}`}
                    >
                        {tab.label}
                        {tab.count !== undefined && (
                            <span className={`admin-tab-count ${active ? 'admin-tab-count-active' : ''}`}>
                                {tab.count}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
