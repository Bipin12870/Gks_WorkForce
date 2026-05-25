'use client';

import { ReactNode, useEffect } from 'react';
import Button from '@/components/ui/Button';
import Icon from '@/components/ui/Icon';
import { X } from 'lucide-react';

interface AdminFormModalProps {
    open: boolean;
    onClose: () => void;
    title: string;
    description?: string;
    children: ReactNode;
    footer?: ReactNode;
    maxWidth?: 'sm' | 'md' | 'lg';
}

const widthClass = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
};

export default function AdminFormModal({
    open,
    onClose,
    title,
    description,
    children,
    footer,
    maxWidth = 'md',
}: AdminFormModalProps) {
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
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
        >
            <div
                className={`relative bg-white w-full sm:rounded-2xl ${widthClass[maxWidth]} max-h-[92vh] flex flex-col shadow-xl border border-gray-200 sm:max-h-[90vh]`}
            >
                <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100 shrink-0">
                    <div className="min-w-0">
                        <h2 className="text-page-title text-base sm:text-lg">{title}</h2>
                        {description && <p className="text-sm text-gray-500 mt-1">{description}</p>}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg hover:bg-gray-100"
                        aria-label="Close"
                    >
                        <Icon icon={X} size="md" />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
                {footer && (
                    <div className="shrink-0 px-5 py-4 border-t border-gray-100 flex flex-col-reverse sm:flex-row gap-2">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
}

/** Standard footer button row */
export function AdminModalFooter({
    onCancel,
    cancelLabel = 'Cancel',
    onPrimary,
    primaryLabel,
    primaryVariant = 'primary',
    primaryDisabled,
}: {
    onCancel: () => void;
    cancelLabel?: string;
    onPrimary: () => void;
    primaryLabel: string;
    primaryVariant?: 'primary' | 'danger';
    primaryDisabled?: boolean;
}) {
    return (
        <>
            <Button variant="secondary" className="flex-1" onClick={onCancel}>
                {cancelLabel}
            </Button>
            <Button
                variant={primaryVariant}
                className="flex-1"
                onClick={onPrimary}
                disabled={primaryDisabled}
            >
                {primaryLabel}
            </Button>
        </>
    );
}
