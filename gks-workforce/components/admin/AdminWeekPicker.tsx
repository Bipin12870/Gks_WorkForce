'use client';

import { formatDate } from '@/lib/utils';
import Icon from '@/components/ui/Icon';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface AdminWeekPickerProps {
    weekStart: Date;
    onPrev: () => void;
    onNext: () => void;
    className?: string;
}

export default function AdminWeekPicker({ weekStart, onPrev, onNext, className = '' }: AdminWeekPickerProps) {
    return (
        <div className={`admin-week-picker ${className}`}>
            <button type="button" onClick={onPrev} className="admin-week-picker-btn" aria-label="Previous week">
                <Icon icon={ChevronLeft} size="sm" />
            </button>
            <span className="admin-week-picker-label">Week of {formatDate(weekStart)}</span>
            <button type="button" onClick={onNext} className="admin-week-picker-btn" aria-label="Next week">
                <Icon icon={ChevronRight} size="sm" />
            </button>
        </div>
    );
}
