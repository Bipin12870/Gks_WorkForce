'use client';

import { ReactNode, useEffect } from 'react';
import Button from './Button';

interface ModalProps {
    open: boolean;
    onClose: () => void;
    title: string;
    description?: string;
    icon?: ReactNode;
    children?: ReactNode;
    primaryAction?: { label: string; onClick: () => void };
    secondaryAction?: { label: string; onClick: () => void };
}

export default function Modal({
    open,
    onClose,
    title,
    description,
    icon,
    children,
    primaryAction,
    secondaryAction,
}: ModalProps) {
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
        >
            <div className="relative bg-white rounded-2xl max-w-sm w-full p-6 shadow-md border border-gray-100">
                <div className="text-center">
                    {icon && <div className="flex justify-center mb-4">{icon}</div>}
                    <h2 id="modal-title" className="text-section-title text-lg">
                        {title}
                    </h2>
                    {description && (
                        <p className="text-sm text-gray-500 font-medium leading-relaxed mt-2">{description}</p>
                    )}
                </div>
                {children && <div className="mt-4">{children}</div>}
                {(primaryAction || secondaryAction) && (
                    <div className="flex gap-3 mt-6">
                        {secondaryAction && (
                            <Button variant="secondary" className="flex-1" onClick={secondaryAction.onClick}>
                                {secondaryAction.label}
                            </Button>
                        )}
                        {primaryAction && (
                            <Button variant="primary" className="flex-1" onClick={primaryAction.onClick}>
                                {primaryAction.label}
                            </Button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
