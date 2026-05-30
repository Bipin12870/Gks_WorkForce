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
        <div className="flex w-full justify-center">
            <div className="flex items-center justify-between bg-slate-100/80 p-1.5 rounded-2xl w-full max-w-[280px]">
                <button
                    type="button"
                    onClick={onPrev}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors"
                    aria-label="Previous week"
                >
                    <Icon icon={ChevronLeft} size="sm" />
                </button>
                <div className="px-2 text-sm font-bold text-slate-800 text-center whitespace-nowrap">
                    Week of {formatDate(weekStart)}
                </div>
                <button
                    type="button"
                    onClick={onNext}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors"
                    aria-label="Next week"
                >
                    <Icon icon={ChevronRight} size="sm" />
                </button>
            </div>
            {trailing}
        </div>
    );
}
