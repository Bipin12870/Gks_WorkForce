import 'server-only';
import { processTimesheetAutomation, PayrollEngineResult } from './utils';

export interface PayrollInput {
    clockIn: string;
    clockOut: string;
    roster?: { start: string; end: string };
    gpsEvents?: { type: 'OUTSIDE' | 'INSIDE'; time: string }[];
    isManualEdit?: boolean;
}

/**
 * Server-authoritative payroll calculation.
 * Wraps the exact same processTimesheetAutomation logic from utils.ts
 * to guarantee identical calculations on client and server.
 */
export function calculatePayrollServer(input: PayrollInput): PayrollEngineResult {
    return processTimesheetAutomation(
        input.clockIn,
        input.clockOut,
        input.roster,
        input.gpsEvents,
        input.isManualEdit ?? false
    );
}
