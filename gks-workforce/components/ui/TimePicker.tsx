'use client';

import { useMemo } from 'react';

interface TimePickerProps {
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
    className?: string;
}

export default function TimePicker({ value, onChange, disabled, className = '' }: TimePickerProps) {
    const [hours, minutes] = useMemo(() => {
        const parts = value.split(':');
        return [parts[0] || '09', parts[1] || '00'];
    }, [value]);

    const hourOptions = useMemo(() => {
        const options = [];
        for (let i = 0; i <= 24; i++) {
            options.push(i.toString().padStart(2, '0'));
        }
        return options;
    }, []);

    const minuteOptions = useMemo(() => {
        if (hours === '24') return ['00'];
        return ['00', '15', '30', '45'];
    }, [hours]);

    const handleHourChange = (newHour: string) => {
        let newMinute = minutes;
        if (newHour === '24') {
            newMinute = '00';
        }
        onChange(`${newHour}:${newMinute}`);
    };

    const handleMinuteChange = (newMinute: string) => {
        onChange(`${hours}:${newMinute}`);
    };

    return (
        <div className={`flex items-center gap-1.5 ${className}`}>
            <div className="flex-1">
                <select
                    value={hours}
                    onChange={(e) => handleHourChange(e.target.value)}
                    disabled={disabled}
                    className="input-base text-center appearance-none cursor-pointer disabled:bg-gray-50 disabled:text-gray-400"
                    aria-label="Hours"
                >
                    {hourOptions.map((h) => (
                        <option key={h} value={h}>{h}</option>
                    ))}
                </select>
            </div>
            <span className="text-gray-400 font-bold">:</span>
            <div className="flex-1">
                <select
                    value={minutes}
                    onChange={(e) => handleMinuteChange(e.target.value)}
                    disabled={disabled}
                    className="input-base text-center appearance-none cursor-pointer disabled:bg-gray-50 disabled:text-gray-400"
                    aria-label="Minutes"
                >
                    {minuteOptions.map((m) => (
                        <option key={m} value={m}>{m}</option>
                    ))}
                </select>
            </div>
        </div>
    );
}
