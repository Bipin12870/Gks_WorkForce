/**
 * Get the Monday (00:00) of the week containing the given date
 */
export function getWeekStart(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    const monday = new Date(d.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday;
}

/**
 * Format time as HH:mm
 */
export function formatTime(hours: number, minutes: number): string {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

/**
 * Parse HH:mm time string to hours and minutes
 */
export function parseTime(timeStr: string): { hours: number; minutes: number } {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return { hours, minutes };
}

/**
 * Get day name from day number
 */
export function getDayName(dayOfWeek: number): string {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[dayOfWeek];
}

/**
 * Format date as "Mon, Jan 27"
 */
export function formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
    });
}

/**
 * Calculate hours between two HH:mm time strings
 */
export function calculateHours(startTime: string, endTime: string): number {
    const start = parseTime(startTime);
    const end = parseTime(endTime);

    const startMinutes = start.hours * 60 + start.minutes;
    const endMinutes = end.hours * 60 + end.minutes;

    return (endMinutes - startMinutes) / 60;
}

/**
 * Check if time1 is before time2 (HH:mm format)
 */
export function isTimeBefore(time1: string, time2: string): boolean {
    const t1 = parseTime(time1);
    const t2 = parseTime(time2);

    if (t1.hours !== t2.hours) {
        return t1.hours < t2.hours;
    }
    return t1.minutes < t2.minutes;
}

/**
 * Check if a shift time is within availability time ranges
 */
export function isWithinAvailability(
    shiftStart: string,
    shiftEnd: string,
    availabilityRanges: { start: string; end: string }[]
): boolean {
    return availabilityRanges.some(range => {
        return (
            !isTimeBefore(shiftStart, range.start) &&
            !isTimeBefore(range.end, shiftEnd)
        );
    });
}
