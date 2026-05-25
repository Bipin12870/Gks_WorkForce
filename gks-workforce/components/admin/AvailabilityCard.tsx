'use client';

import { TimeRange } from '@/types';
import { getDayName } from '@/lib/utils';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';

interface AvailabilityCardProps {
    staffName: string;
    dayOfWeek?: number;
    timeRanges: TimeRange[];
    rosteredForDay: boolean;
    highlighted?: boolean;
    onApprove: () => void;
}

export default function AvailabilityCard({
    staffName,
    dayOfWeek,
    timeRanges,
    rosteredForDay,
    highlighted,
    onApprove,
}: AvailabilityCardProps) {
    return (
        <div
            className={`rounded-xl border-l-4 p-4 ${
                highlighted
                    ? 'bg-blue-50/60 border-blue-500 ring-2 ring-blue-100 border-l-blue-600'
                    : 'bg-white border-gray-200 border-l-blue-400 shadow-sm'
            }`}
        >
            <div className="flex justify-between items-start gap-2 mb-3">
                <div>
                    <p className="text-sm font-semibold text-gray-900">{staffName}</p>
                    {dayOfWeek !== undefined && (
                        <p className="text-label text-blue-700 mt-0.5">{getDayName(dayOfWeek)}</p>
                    )}
                </div>
                {rosteredForDay && <Badge variant="success">Rostered</Badge>}
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
                {timeRanges.map((range, idx) => (
                    <span
                        key={idx}
                        className="text-xs font-medium text-gray-700 bg-gray-50 px-2 py-1 rounded-md border border-gray-100 tabular-nums"
                    >
                        {range.start} – {range.end}
                    </span>
                ))}
            </div>
            <Button
                variant={rosteredForDay ? 'secondary' : 'primary'}
                size="sm"
                fullWidth
                onClick={onApprove}
                className={rosteredForDay ? 'border-green-200 text-green-800' : ''}
            >
                {rosteredForDay ? 'Add / edit shift' : 'Approve shift'}
            </Button>
        </div>
    );
}
