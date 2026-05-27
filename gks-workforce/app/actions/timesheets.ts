'use server';

import { getAdminDb } from '@/lib/firebase-admin';
import * as admin from 'firebase-admin';
import { requireStaff, requireAdmin } from './shared/auth';
import { logAuditEvent } from '@/lib/audit-logger';
import { getWeekStart, parseTime, isWithinShopHours, hasOverlap } from '@/lib/utils';

/**
 * Helper to check if a clock-out time represents significant overtime (> 30 mins)
 */
function checkSignificantOvertime(clockOutRounded: string, shiftEndTime: string, thresholdMinutes = 30): boolean {
    const [oh, om] = clockOutRounded.split(':').map(Number);
    const [sh, sm] = shiftEndTime.split(':').map(Number);

    let diff = (oh * 60 + om) - (sh * 60 + sm);

    // Handle cross-midnight: e.g. shift ends at 23:00, clock out at 00:30
    if (diff < -1000) {
        diff += 24 * 60;
    }

    return diff >= thresholdMinutes;
}

/**
 * Creates a manual timesheet submission for a rostered shift (Staff only).
 */
export async function createManualTimesheet(shiftId: string, workedStart: string, workedEnd: string) {
    try {
        const user = await requireStaff();
        const db = getAdminDb();

        // 1. Fetch shift
        const shiftDoc = await db.collection('shifts').doc(shiftId).get();
        if (!shiftDoc.exists) {
            throw new Error('Rostered shift not found.');
        }
        const shiftData = shiftDoc.data()!;

        // 2. Validate ownership (unless Admin)
        if (user.role === 'STAFF' && shiftData.staffId !== user.id) {
            throw new Error('Unauthorized: You can only submit timesheets for your own shifts.');
        }

        // 3. Check for existing timesheet
        const timesheetsSnap = await db.collection('timesheets')
            .where('shiftId', '==', shiftId)
            .get();
        if (!timesheetsSnap.empty) {
            throw new Error('A timesheet for this shift has already been submitted.');
        }

        // 4. Validate hours and bounds
        if (!isWithinShopHours(workedStart) || !isWithinShopHours(workedEnd)) {
            throw new Error('Times must be within shop hours (09:00 - 23:59).');
        }

        const start = parseTime(workedStart);
        const end = parseTime(workedEnd);
        const startTotal = start.hours * 60 + start.minutes;
        const endTotal = end.hours * 60 + end.minutes;
        if (endTotal <= startTotal) {
            throw new Error('Invalid duration. Worked end must be after start time.');
        }

        // 5. Check significant overtime
        const requiresNote = checkSignificantOvertime(workedEnd, shiftData.endTime);

        // 6. Construct payload
        const dateTimestamp = shiftData.date; // Timestamp from db
        const weekStartDate = admin.firestore.Timestamp.fromDate(getWeekStart(dateTimestamp.toDate()));

        const timesheetPayload = {
            staffId: shiftData.staffId,
            shiftId: shiftId,
            date: dateTimestamp,
            weekStartDate: weekStartDate,
            approvedShiftStart: shiftData.startTime,
            approvedShiftEnd: shiftData.endTime,
            workedStart: workedStart,
            workedEnd: workedEnd,
            status: 'PENDING',
            source: 'MANUAL',
            requiresAdminNote: requiresNote,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        const docRef = await db.collection('timesheets').add(timesheetPayload);

        // 7. Audit log
        await logAuditEvent({
            actorId: user.id,
            actorRole: user.role,
            action: 'TIMESHEET_MANUAL_SUBMIT',
            targetCollection: 'timesheets',
            targetDocumentId: docRef.id,
            newValues: {
                staffId: shiftData.staffId,
                shiftId,
                workedStart,
                workedEnd,
                status: 'PENDING',
                source: 'MANUAL',
            },
        });

        return { success: true, id: docRef.id };
    } catch (error) {
        console.error('Error in createManualTimesheet:', error);
        throw new Error((error as Error).message);
    }
}

/**
 * Updates a timesheet's status (Approve/Reject) or adjusts its worked times (Admin only).
 * If the timesheet is already approved, direct updates are blocked to enforce immutability.
 */
export async function updateTimesheetStatus(
    timesheetId: string,
    status: 'PENDING' | 'APPROVED' | 'REJECTED',
    workedStart?: string,
    workedEnd?: string,
    note?: string
) {
    try {
        const adminUser = await requireAdmin();
        const db = getAdminDb();

        // 1. Fetch timesheet
        const timesheetDoc = await db.collection('timesheets').doc(timesheetId).get();
        if (!timesheetDoc.exists) {
            throw new Error('Timesheet not found.');
        }
        const timesheetData = timesheetDoc.data()!;

        // 2. Immutability Enforcement
        if (timesheetData.status === 'APPROVED') {
            throw new Error('Approved timesheets are immutable. Please submit a correction instead.');
        }

        const finalStart = workedStart || timesheetData.workedStart;
        const finalEnd = workedEnd || timesheetData.workedEnd;

        // 3. Validation
        if (!isWithinShopHours(finalStart) || !isWithinShopHours(finalEnd)) {
            throw new Error('Times must be within shop hours (09:00 - 23:59).');
        }

        const start = parseTime(finalStart);
        const end = parseTime(finalEnd);
        const startTotal = start.hours * 60 + start.minutes;
        const endTotal = end.hours * 60 + end.minutes;
        if (endTotal <= startTotal) {
            throw new Error('Invalid duration. Worked end must be after start time.');
        }

        // 4. Overlap Check for Approvals
        if (status === 'APPROVED') {
            const approvedTimesheets = await db.collection('timesheets')
                .where('staffId', '==', timesheetData.staffId)
                .where('status', '==', 'APPROVED')
                .get();

            const targetDateStr = timesheetData.date.toDate().toDateString();
            const overlapsApproved = approvedTimesheets.docs.some(doc => {
                if (doc.id === timesheetId) return false;
                const t = doc.data();
                return t.date.toDate().toDateString() === targetDateStr &&
                    hasOverlap(
                        { start: finalStart, end: finalEnd },
                        [{ start: t.workedStart, end: t.workedEnd }]
                    );
            });

            if (overlapsApproved) {
                throw new Error('This timesheet overlaps with another approved timesheet for this staff member on the same day.');
            }
        }

        // 5. Update Timesheet
        const updates: Record<string, any> = {
            status,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        if (workedStart) updates.workedStart = workedStart;
        if (workedEnd) updates.workedEnd = workedEnd;
        if (note !== undefined) updates.adminNote = note;

        await db.collection('timesheets').doc(timesheetId).update(updates);

        // 6. Audit Log
        let action = 'TIMESHEET_UPDATE';
        if (status === 'APPROVED') action = 'TIMESHEET_APPROVE';
        if (status === 'REJECTED') action = 'TIMESHEET_REJECT';

        await logAuditEvent({
            actorId: adminUser.id,
            actorRole: adminUser.role,
            action,
            targetCollection: 'timesheets',
            targetDocumentId: timesheetId,
            previousValues: {
                status: timesheetData.status,
                workedStart: timesheetData.workedStart,
                workedEnd: timesheetData.workedEnd,
                adminNote: timesheetData.adminNote || null,
            },
            newValues: {
                status,
                workedStart: finalStart,
                workedEnd: finalEnd,
                adminNote: note ?? timesheetData.adminNote ?? null,
            },
        });

        return { success: true };
    } catch (error) {
        console.error('Error in updateTimesheetStatus:', error);
        throw new Error((error as Error).message);
    }
}

/**
 * Creates a correction record for an already approved timesheet (Admin only).
 * The original timesheet remains unchanged to preserve historical records,
 * and the correction is registered in the timesheetCorrections collection.
 */
export async function correctTimesheet(
    timesheetId: string,
    newWorkedStart: string,
    newWorkedEnd: string,
    reason: string,
    status: 'APPROVED' | 'REJECTED' = 'APPROVED'
) {
    try {
        const adminUser = await requireAdmin();
        const db = getAdminDb();

        if (!reason || reason.trim() === '') {
            throw new Error('A reason for the correction is required.');
        }

        // 1. Fetch timesheet
        const timesheetDoc = await db.collection('timesheets').doc(timesheetId).get();
        if (!timesheetDoc.exists) {
            throw new Error('Timesheet not found.');
        }
        const timesheetData = timesheetDoc.data()!;

        // 2. Validate current status
        if (timesheetData.status !== 'APPROVED') {
            throw new Error('Only approved timesheets can be corrected. Use standard adjustments for pending records.');
        }

        // 3. Validate new times (only if remaining APPROVED)
        if (status === 'APPROVED') {
            if (!isWithinShopHours(newWorkedStart) || !isWithinShopHours(newWorkedEnd)) {
                throw new Error('Times must be within shop hours (09:00 - 23:59).');
            }

            const start = parseTime(newWorkedStart);
            const end = parseTime(newWorkedEnd);
            const startTotal = start.hours * 60 + start.minutes;
            const endTotal = end.hours * 60 + end.minutes;
            if (endTotal <= startTotal) {
                throw new Error('Invalid duration. Worked end must be after start time.');
            }

            // 4. Overlap Check (excluding current timesheet ID)
            const approvedTimesheets = await db.collection('timesheets')
                .where('staffId', '==', timesheetData.staffId)
                .where('status', '==', 'APPROVED')
                .get();

            const targetDateStr = timesheetData.date.toDate().toDateString();
            const overlapsApproved = approvedTimesheets.docs.some(doc => {
                if (doc.id === timesheetId) return false;
                const t = doc.data();
                return t.date.toDate().toDateString() === targetDateStr &&
                    hasOverlap(
                        { start: newWorkedStart, end: newWorkedEnd },
                        [{ start: t.workedStart, end: t.workedEnd }]
                    );
            });

            if (overlapsApproved) {
                throw new Error('This correction overlaps with another approved timesheet for this staff member on the same day.');
            }
        }

        // 5. Create Correction Document
        const correctionPayload = {
            originalTimesheetId: timesheetId,
            correctedBy: adminUser.id,
            previousWorkedStart: timesheetData.workedStart,
            previousWorkedEnd: timesheetData.workedEnd,
            newWorkedStart: status === 'REJECTED' ? timesheetData.workedStart : newWorkedStart,
            newWorkedEnd: status === 'REJECTED' ? timesheetData.workedEnd : newWorkedEnd,
            reason,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        const correctionDocRef = await db.collection('timesheetCorrections').add(correctionPayload);

        // Update the original timesheet document with corrected status/times and reason as adminNote
        const updates: Record<string, any> = {
            status,
            adminNote: reason,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        if (status === 'APPROVED') {
            updates.workedStart = newWorkedStart;
            updates.workedEnd = newWorkedEnd;
        }

        await db.collection('timesheets').doc(timesheetId).update(updates);

        // 6. Audit Log
        await logAuditEvent({
            actorId: adminUser.id,
            actorRole: adminUser.role,
            action: status === 'REJECTED' ? 'TIMESHEET_VOID_REJECT' : 'TIMESHEET_CORRECT',
            targetCollection: 'timesheets',
            targetDocumentId: timesheetId,
            previousValues: {
                status: timesheetData.status,
                workedStart: timesheetData.workedStart,
                workedEnd: timesheetData.workedEnd,
            },
            newValues: {
                status,
                workedStart: status === 'REJECTED' ? timesheetData.workedStart : newWorkedStart,
                workedEnd: status === 'REJECTED' ? timesheetData.workedEnd : newWorkedEnd,
                reason,
                correctionId: correctionDocRef.id,
            },
        });

        return { success: true, id: correctionDocRef.id };
    } catch (error) {
        console.error('Error in correctTimesheet:', error);
        throw new Error((error as Error).message);
    }
}
