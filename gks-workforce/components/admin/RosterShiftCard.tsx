'use client';

import { Shift } from '@/types';
import { formatDate, getDayName, calculateHours, formatHoursAndMinutes, formatTimeTo12Hour, getShopDayOfWeek } from '@/lib/utils';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Icon from '@/components/ui/Icon';
import { Clock, Pencil, Trash2 } from 'lucide-react';

interface RosterShiftCardProps {
    shift: Shift;
    staffName: string;
    showDayBadge?: boolean;
    highlighted?: boolean;
    onSelect?: () => void;
    onEdit?: () => void;
    onRemove?: () => void;
    compact?: boolean;
}

export default function RosterShiftCard({
    shift,
    staffName,
    showDayBadge,
    highlighted,
    onSelect,
    onEdit,
    onRemove,
    compact,
}: RosterShiftCardProps) {
    const hoursVal = calculateHours(shift.startTime, shift.endTime);
    const hoursFormatted = formatHoursAndMinutes(hoursVal);
    const hoursFormattedShort = formatHoursAndMinutes(hoursVal, true);

    return (
        <div
            role={onSelect ? 'button' : undefined}
            tabIndex={onSelect ? 0 : undefined}
            onClick={onSelect}
            onKeyDown={onSelect ? (e) => e.key === 'Enter' && onSelect() : undefined}
            className={`rounded-xl border p-4 transition-all ${
                highlighted ? 'bg-blue-50/60 border-blue-400 ring-2 ring-blue-100' : 'bg-white border-gray-200 hover:border-blue-200'
            } ${onSelect ? 'cursor-pointer' : ''}`}
        >
            <div className="flex justify-between items-start gap-2">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-gray-900 truncate">{staffName}</p>
                        {showDayBadge && (
                            <Badge variant="neutral">{getDayName(getShopDayOfWeek(shift.date.toDate())).slice(0, 3)}</Badge>
                        )}
                    </div>
                    <p className="text-label mt-0.5">{formatDate(shift.date.toDate())}</p>
                    <div className="inline-flex items-center gap-1.5 mt-2 text-sm font-medium text-blue-700 tabular-nums">
                        <Icon icon={Clock} size="sm" />
                        {formatTimeTo12Hour(shift.startTime)} – {formatTimeTo12Hour(shift.endTime)}
                    </div>
                </div>
                {!compact && (onEdit || onRemove) && (
                    <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        {onEdit && (
                            <Button variant="ghost" size="sm" onClick={onEdit} aria-label="Edit shift" className="min-w-10 min-h-10 p-2">
                                <Icon icon={Pencil} size="sm" />
                            </Button>
                        )}
                        {onRemove && (
                            <Button variant="ghost-danger" size="sm" onClick={onRemove} aria-label="Remove shift" className="min-w-10 min-h-10 p-2">
                                <Icon icon={Trash2} size="sm" />
                            </Button>
                        )}
                    </div>
                )}
            </div>
            {!compact && (
                <p className="text-label text-right mt-2 tabular-nums">{hoursFormatted}</p>
            )}
            {compact && (
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                    <Badge variant="info">{formatTimeTo12Hour(shift.startTime)} – {formatTimeTo12Hour(shift.endTime)}</Badge>
                    <span className="text-xs font-semibold tabular-nums">{hoursFormattedShort}</span>
                </div>
            )}
        </div>
    );
}
