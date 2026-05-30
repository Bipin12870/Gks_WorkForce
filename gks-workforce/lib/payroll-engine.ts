import 'server-only';
import { processTimesheetAutomation, PayrollEngineResult } from './utils';
import { getAdminDb } from './firebase-admin';

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
export async function calculatePayrollServer(input: PayrollInput): Promise<PayrollEngineResult> {
    const db = getAdminDb();
    const configDoc = await db.collection('config').doc('shopLocation').get();
    const config = configDoc.exists ? configDoc.data() : {};
    
    return processTimesheetAutomation(
        input.clockIn,
        input.clockOut,
        input.roster,
        input.gpsEvents,
        input.isManualEdit ?? false,
        {
            shopOpenTime: config?.shopOpenTime,
            shopCloseTime: config?.shopCloseTime,
        }
    );
}
