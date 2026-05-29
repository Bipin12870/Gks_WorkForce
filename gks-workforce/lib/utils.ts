/**
 * Operating hours constants
 */
export const SHOP_OPEN_TIME = '05:00'; // TODO: revert to '09:00' after testing
export const SHOP_CLOSE_TIME = '23:59';

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

/** Local calendar date YYYY-MM-DD (avoids UTC drift in doc IDs). */
export function formatLocalDateKey(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/**
 * Shift epoch milliseconds to represent client local calendar date at midnight, 
 * returning a Date object representing that local midnight in server storage.
 */
export function getClientLocalDate(serverTimeMs: number, timezoneOffset: number): Date {
    const shifted = new Date(serverTimeMs - (timezoneOffset * 60 * 1000));
    const year = shifted.getUTCFullYear();
    const month = shifted.getUTCMonth();
    const day = shifted.getUTCDate();
    const utcMidnight = Date.UTC(year, month, day, 0, 0, 0, 0);
    return new Date(utcMidnight + (timezoneOffset * 60 * 1000));
}

/**
 * Returns the Monday (local midnight) of the week containing the given timestamp,
 * adjusted for the client's timezone offset.
 */
export function getWeekStartForOffset(dateMs: number, timezoneOffset: number): Date {
    const shifted = new Date(dateMs - (timezoneOffset * 60 * 1000));
    const day = shifted.getUTCDay();
    const diff = shifted.getUTCDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), diff, 0, 0, 0, 0));
    return new Date(monday.getTime() + (timezoneOffset * 60 * 1000));
}

/**
 * Returns the local day of the week (0 = Sunday, 1 = Monday, etc.) for the timestamp and offset.
 */
export function getDayOfWeekForOffset(dateMs: number, timezoneOffset: number): number {
    const shifted = new Date(dateMs - (timezoneOffset * 60 * 1000));
    return shifted.getUTCDay();
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

export interface PayrollEngineResult {
    raw: {
        clockIn: string;
        clockOut: string;
    };
    validation: {
        isValid: boolean;
        reason?: string;
    };
    classification: {
        flags: string[];
    };
    payroll: {
        rawMinutes: number;
        payableMinutes: number;
        overtimeMinutes: number;
        afterHoursMinutes: number;
        roundedPayableMinutes: number;
    };
    approval: {
        status: 'AUTO_APPROVED' | 'FLAGGED' | 'NEEDS_REVIEW' | 'REJECTED';
        reason: string;
    };
}

/**
 * The Hybrid Approval & Payroll Engine.
 * Standardizes clock data capture, validation, classification, and payroll calculation.
 */
export function processTimesheetAutomation(
    clockIn: string,
    clockOut: string,
    roster?: { start: string; end: string },
    gpsEvents?: { type: 'OUTSIDE' | 'INSIDE'; time: string }[],
    isManualEdit: boolean = false
): PayrollEngineResult {
    const flags: string[] = [];
    
    // 1. RAW DATA CAPTURE
    const result: PayrollEngineResult = {
        raw: { clockIn, clockOut },
        validation: { isValid: true },
        classification: { flags: [] },
        payroll: {
            rawMinutes: 0,
            payableMinutes: 0,
            overtimeMinutes: 0,
            afterHoursMinutes: 0,
            roundedPayableMinutes: 0
        },
        approval: { status: 'NEEDS_REVIEW', reason: '' }
    };

    if (!clockIn || !clockOut) {
        result.validation = { isValid: false, reason: 'Missing clock-in or clock-out' };
        result.approval = { status: 'NEEDS_REVIEW', reason: 'Incomplete timestamps' };
        return result;
    }

    const start = parseTime(clockIn);
    const end = parseTime(clockOut);
    const startTotal = start.hours * 60 + start.minutes;
    const endTotal = end.hours * 60 + end.minutes;

    // 2. VALIDATION ENGINE
    if (endTotal <= startTotal) {
        result.validation = { isValid: false, reason: 'Negative or zero duration detected' };
        result.approval = { status: 'REJECTED', reason: 'End time must be after start time' };
        return result;
    }

    // 3. PAYROLL ENGINE (Duration Calculation)
    const rawMinutes = endTotal - startTotal;
    result.payroll.rawMinutes = rawMinutes;
    result.payroll.payableMinutes = rawMinutes; // Base payable is raw worked time
    result.payroll.roundedPayableMinutes = Math.round(rawMinutes / 5) * 5;

    // 4. CLASSIFICATION ENGINE (Flags & Bounds)
    // Store Hours (05:00 - 23:59) — TODO: revert to 09:00 after testing
    const shopOpenTotal = 5 * 60;
    const shopCloseTotal = 23 * 60 + 59;

    if (startTotal < shopOpenTotal || endTotal > shopCloseTotal) {
        flags.push('AFTER_HOURS');
        if (endTotal > shopCloseTotal) {
            result.payroll.afterHoursMinutes = endTotal - Math.max(startTotal, shopCloseTotal);
        }
    }

    // Roster Deviations
    if (roster) {
        const rStart = parseTime(roster.start);
        const rEnd = parseTime(roster.end);
        const rStartTotal = rStart.hours * 60 + rStart.minutes;
        const rEndTotal = rEnd.hours * 60 + rEnd.minutes;

        // Overtime (> 15 min past roster)
        if (endTotal > rEndTotal + 15) {
            flags.push('OVERTIME');
            result.payroll.overtimeMinutes = endTotal - rEndTotal;
        }

        // Early Clock-in (> 10 min before roster)
        if (startTotal < rStartTotal - 10) {
            flags.push('EARLY_CLOCK_IN');
        }

        // Late Clock-in (> 15 min past roster)
        if (startTotal > rStartTotal + 15) {
            flags.push('LATE_CLOCK_IN');
        }
    }

    // GPS Monitoring
    const hasGpsOutside = gpsEvents?.some(e => e.type === 'OUTSIDE');
    if (hasGpsOutside) {
        flags.push('GPS_OUTSIDE');
    }

    if (isManualEdit) {
        flags.push('MANUAL_EDIT_DETECTED');
    }

    result.classification.flags = flags;

    // 5. APPROVAL ENGINE (Hybrid Logic)
    if (!roster) {
        result.approval = { status: 'NEEDS_REVIEW', reason: 'Unscheduled shift — no roster entry found. Admin must verify.' };
    } else if (isManualEdit) {
        result.approval = { status: 'NEEDS_REVIEW', reason: 'Manual admin adjustment requires verification' };
    } else if (flags.includes('AFTER_HOURS') || flags.includes('GPS_OUTSIDE')) {
        result.approval = { status: 'FLAGGED', reason: 'Policy violation detected (After-hours or GPS mismatch)' };
    } else if (flags.includes('OVERTIME') && result.payroll.overtimeMinutes > 15) {
        result.approval = { status: 'FLAGGED', reason: 'Significant overtime detected (>15 min)' };
    } else if (flags.includes('EARLY_CLOCK_IN')) {
        result.approval = { status: 'FLAGGED', reason: 'Early arrival detected (>10 min before roster)' };
    } else if (flags.includes('LATE_CLOCK_IN')) {
        result.approval = { status: 'FLAGGED', reason: 'Late arrival detected' };
    } else {
        result.approval = { status: 'AUTO_APPROVED', reason: 'Clean shift within standard parameters' };
    }

    return result;
}

/**
 * Backwards compatible helper for legacy calculateHours calls.
 */
export function calculateHours(startTime: string, endTime: string): number {
    const result = processTimesheetAutomation(startTime, endTime);
    return result.payroll.rawMinutes / 60;
}

/**
 * Format hours (in decimal) to actual hours and minutes.
 * E.g. 0.0833 -> "5 mins" (or "5m" if short is true)
 * E.g. 1.5 -> "1 hr 30 mins" (or "1h 30m" if short is true)
 * E.g. 12 -> "12 hrs" (or "12h" if short is true)
 */
export function formatHoursAndMinutes(hours: number, short: boolean = false): string {
    const isNegative = hours < 0;
    const absHours = Math.abs(hours);
    const totalMinutes = Math.round(absHours * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;

    const sign = isNegative ? '-' : '';

    if (short) {
        if (h === 0) {
            return `${sign}${m}m`;
        }
        if (m === 0) {
            return `${sign}${h}h`;
        }
        return `${sign}${h}h ${m}m`;
    } else {
        if (h === 0) {
            return `${sign}${m} min${m !== 1 ? 's' : ''}`;
        }
        if (m === 0) {
            return `${sign}${h} hr${h !== 1 ? 's' : ''}`;
        }
        return `${sign}${h} hr${h !== 1 ? 's' : ''} ${m} min${m !== 1 ? 's' : ''}`;
    }
}

/**
 * Backwards compatible helper for legacy calculatePayrollRecord calls.
 */
export function calculatePayrollRecord(
    workedStart: string,
    workedEnd: string,
    rosteredEnd?: string,
    isGpsOutside?: boolean
): { isValid: boolean; rawMinutes: number; payableMinutes: number; flags: string[] } {
    const roster = rosteredEnd ? { start: workedStart, end: rosteredEnd } : undefined;
    const gpsEvents: { type: 'OUTSIDE' | 'INSIDE'; time: string }[] = isGpsOutside ? [{ type: 'OUTSIDE', time: workedEnd }] : [];
    
    const result = processTimesheetAutomation(workedStart, workedEnd, roster, gpsEvents);
    
    return {
        isValid: result.validation.isValid,
        rawMinutes: result.payroll.rawMinutes,
        payableMinutes: result.payroll.payableMinutes,
        flags: result.classification.flags
    };
}

/**
 * Check if a time string is within the strictly enforced shop hours (09:00-23:59)
 */
export function isWithinShopHours(timeStr: string): boolean {
    if (!timeStr) return false;
    return !isTimeBefore(timeStr, SHOP_OPEN_TIME) && !isTimeBefore(SHOP_CLOSE_TIME, timeStr);
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
 * Check if a time string (HH:mm) is on a 15-minute interval
 */
export function isValidInterval(timeStr: string): boolean {
    if (!timeStr) return false;
    const { minutes } = parseTime(timeStr);
    return minutes % 15 === 0;
}

/**
 * Normalize a time string to the nearest 15-minute interval
 */
export function normalizeTo15Minutes(timeStr: string): string {
    if (!timeStr) return timeStr;
    const { hours, minutes } = parseTime(timeStr);
    const roundedMinutes = Math.round(minutes / 15) * 15;

    let finalHours = hours;
    let finalMinutes = roundedMinutes;

    if (finalMinutes === 60) {
        finalMinutes = 0;
        finalHours += 1;
    }

    return `${finalHours.toString().padStart(2, '0')}:${finalMinutes.toString().padStart(2, '0')}`;
}

/**
 * Increment a time string by specified minutes
 */
export function incrementTime(timeStr: string, minsToAdd: number): string {
    const { hours, minutes } = parseTime(timeStr);
    let totalMinutes = hours * 60 + minutes + minsToAdd;
    
    // Clamp to 24:00
    if (totalMinutes > 1440) totalMinutes = 1440;
    
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

/**
 * Decrement a time string by specified minutes
 */
export function decrementTime(timeStr: string, minsToSub: number): string {
    const { hours, minutes } = parseTime(timeStr);
    let totalMinutes = hours * 60 + minutes - minsToSub;
    
    // Clamp to 00:00
    if (totalMinutes < 0) totalMinutes = 0;
    
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

/**
 * Check if a new range overlaps with existing ranges
 */
export function hasOverlap(newRange: { start: string, end: string }, existingRanges: { start: string, end: string }[], excludeIndex?: number): boolean {
    return existingRanges.some((range, index) => {
        if (excludeIndex !== undefined && index === excludeIndex) return false;
        
        // A overlaps B if (A.start < B.end) AND (A.end > B.start)
        return isTimeBefore(newRange.start, range.end) && isTimeBefore(range.start, newRange.end);
    });
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

/**
 * Convert HH:mm 24-hour time string to 12-hour format with lowercase am/pm
 * E.g. "09:00" -> "9:00 am"
 * E.g. "17:30" -> "5:30 pm"
 * E.g. "12:00" -> "12:00 pm"
 * E.g. "00:00" -> "12:00 am"
 */
export function formatTimeTo12Hour(timeStr: string): string {
    if (!timeStr) return '';
    const parts = timeStr.split(':');
    if (parts.length < 2) return timeStr;
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    if (isNaN(hours) || isNaN(minutes)) return timeStr;

    const ampm = hours >= 12 ? 'pm' : 'am';
    const hour12 = hours % 12 === 0 ? 12 : hours % 12;
    const minStr = String(minutes).padStart(2, '0');
    return `${hour12}:${minStr} ${ampm}`;
}
