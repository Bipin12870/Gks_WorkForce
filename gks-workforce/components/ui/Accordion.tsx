'use client';

import { ReactNode, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import Icon from './Icon';

export interface AccordionItem {
    id: string;
    title: string;
    description?: string;
    content: ReactNode;
    defaultOpen?: boolean;
}

interface AccordionProps {
    items: AccordionItem[];
    /** Only one section open at a time */
    single?: boolean;
}

export default function Accordion({ items, single = true }: AccordionProps) {
    const defaultOpen = items.find((i) => i.defaultOpen)?.id ?? null;
    const [openIds, setOpenIds] = useState<Set<string>>(() => (defaultOpen ? new Set([defaultOpen]) : new Set()));

    const toggle = (id: string) => {
        setOpenIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                if (single) next.clear();
                next.add(id);
            }
            return next;
        });
    };

    return (
        <div className="space-y-2">
            {items.map((item) => {
                const isOpen = openIds.has(item.id);
                return (
                    <div key={item.id} className="card-base overflow-hidden">
                        <button
                            type="button"
                            onClick={() => toggle(item.id)}
                            className="w-full flex items-center justify-between gap-3 p-4 text-left min-h-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
                            aria-expanded={isOpen}
                            aria-controls={`accordion-panel-${item.id}`}
                        >
                            <div>
                                <p className="text-section-title">{item.title}</p>
                                {item.description && (
                                    <p className="text-label mt-0.5">{item.description}</p>
                                )}
                            </div>
                            <Icon
                                icon={ChevronDown}
                                size="md"
                                className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                            />
                        </button>
                        {isOpen && (
                            <div
                                id={`accordion-panel-${item.id}`}
                                className="px-4 pb-4 pt-0 border-t border-gray-100"
                            >
                                {item.content}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
