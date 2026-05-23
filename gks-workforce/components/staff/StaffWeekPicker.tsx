'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import Icon from '@/components/ui/Icon';
import Button from '@/components/ui/Button';

interface StaffWeekPickerProps {
    weekStart: Date;
    onPrev: () => void;
    onNext: () => void;
    trailing?: React.ReactNode;
}

export default function StaffWeekPicker({ weekStart, onPrev, onNext, trailing }: StaffWeekPickerProps) {
    return (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 w-full">
            <div className="flex items-center bg-gray-50 p-1 rounded-xl border border-gray-100 flex-1 sm:flex-initial">
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onPrev}
                    className="min-h-11 min-w-11 p-0 shrink-0"
                    aria-label="Previous week"
                >
                    <Icon icon={ChevronLeft} size="md" />
                </Button>
                <div className="flex-1 px-3 py-2 text-sm font-semibold text-gray-900 text-center whitespace-nowrap min-w-[140px]">
                    Week of {formatDate(weekStart)}
                </div>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onNext}
                    className="min-h-11 min-w-11 p-0 shrink-0"
                    aria-label="Next week"
                >
                    <Icon icon={ChevronRight} size="md" />
                </Button>
            </div>
            {trailing}
        </div>
    );
}
