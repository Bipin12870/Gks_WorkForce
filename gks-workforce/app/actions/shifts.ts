'use server';

import { getAdminDb } from '@/lib/firebase-admin';
import * as admin from 'firebase-admin';
import { requireAdmin } from './shared/auth';
import { logAuditEvent } from '@/lib/audit-logger';
import { getWeekStart, parseTime, isWithinShopHours, hasOverlap, isWithinAvailability } from '@/lib/utils';

/**
 * Creates a new rostered shift (Admin only).
 * Validates shop hours, overlap rules, and availability rules on the server.
 */
export async function createShift(shiftData: {
    staffId: string;
    dateMs: number;
    startTime: string;
    endTime: string;
}) {
    try {
        const adminUser = await requireAdmin();
        const db = getAdminDb();

        const { staffId, dateMs, startTime, endTime } = shiftData;

        // 1. Validate shop hours & duration
        if (!isWithinShopHours(startTime) || !isWithinShopHours(endTime)) {
            throw new Error('Shifts must be between 09:00 and 23:59.');
        }

        const start = parseTime(startTime);
        const end = parseTime(endTime);
        const startTotal = start.hours * 60 + start.minutes;
        const endTotal = end.hours * 60 + end.minutes;
        if (endTotal <= startTotal) {
            throw new Error('Invalid shift duration. End time must be after start time.');
        }

        // Determine target day and week start
        const targetDate = new Date(dateMs);
        targetDate.setHours(0, 0, 0, 0);
        const dayOfWeek = targetDate.getDay();
        const weekStartDate = getWeekStart(targetDate);

        const dateTimestamp = admin.firestore.Timestamp.fromDate(targetDate);
        const weekStartTimestamp = admin.firestore.Timestamp.fromDate(weekStartDate);

        // 2. Validate availability rules
        const availSnap = await db.collection('availability')
            .where('staffId', '==', staffId)
            .where('weekStartDate', '==', weekStartTimestamp)
            .where('dayOfWeek', '==', dayOfWeek)
            .where('status', '==', 'SUBMITTED')
            .get();

        if (availSnap.empty) {
            throw new Error('No submitted availability for this staff on this day.');
        }

        const availabilityData = availSnap.docs[0].data();
        const timeRanges = availabilityData.timeRanges || [];

        if (!isWithinAvailability(startTime, endTime, timeRanges)) {
            throw new Error('Shift must be within staff availability.');
        }

        // 3. Overlap check on the same day
        const existingShiftsSnap = await db.collection('shifts')
            .where('staffId', '==', staffId)
            .where('date', '==', dateTimestamp)
            .where('status', '==', 'APPROVED')
            .get();

        const existingShifts = existingShiftsSnap.docs.map(doc => ({
            id: doc.id,
            start: doc.data().startTime,
            end: doc.data().endTime,
        }));

        if (hasOverlap({ start: startTime, end: endTime }, existingShifts)) {
            throw new Error('Shift overlaps with existing shift for this staff on this day.');
        }

        // 4. Create Shift
        const newShiftPayload = {
            staffId,
            date: dateTimestamp,
            startTime,
            endTime,
            status: 'APPROVED',
            approvedBy: adminUser.id,
            approvedAt: admin.firestore.FieldValue.serverTimestamp(),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedBy: adminUser.id,
        };

        const docRef = await db.collection('shifts').add(newShiftPayload);

        // 5. Audit Log
        await logAuditEvent({
            actorId: adminUser.id,
            actorRole: adminUser.role,
            action: 'SHIFT_CREATE',
            targetCollection: 'shifts',
            targetDocumentId: docRef.id,
            newValues: {
                staffId,
                date: dateTimestamp,
                startTime,
                endTime,
            },
        });

        return { success: true, id: docRef.id };
    } catch (error) {
        console.error('Error in createShift:', error);
        throw new Error((error as Error).message);
    }
}

/**
 * Updates an existing rostered shift (Admin only).
 * Validates overlap and availability constraints against updated times.
 */
export async function updateShift(
    shiftId: string,
    shiftData: {
        startTime: string;
        endTime: string;
    }
) {
    try {
        const adminUser = await requireAdmin();
        const db = getAdminDb();

        const { startTime, endTime } = shiftData;

        // 1. Fetch existing shift
        const shiftDoc = await db.collection('shifts').doc(shiftId).get();
        if (!shiftDoc.exists) {
            throw new Error('Shift not found.');
        }
        const existingShift = shiftDoc.data()!;

        // 2. Validate shop hours & duration
        if (!isWithinShopHours(startTime) || !isWithinShopHours(endTime)) {
            throw new Error('Shifts must be between 09:00 and 23:59.');
        }

        const start = parseTime(startTime);
        const end = parseTime(endTime);
        const startTotal = start.hours * 60 + start.minutes;
        const endTotal = end.hours * 60 + end.minutes;
        if (endTotal <= startTotal) {
            throw new Error('Invalid shift duration. End time must be after start time.');
        }

        // Determine target day and week start from existing shift
        const targetDate = existingShift.date.toDate();
        const dayOfWeek = targetDate.getDay();
        const weekStartDate = getWeekStart(targetDate);
        const weekStartTimestamp = admin.firestore.Timestamp.fromDate(weekStartDate);

        // 3. Validate availability rules
        const availSnap = await db.collection('availability')
            .where('staffId', '==', existingShift.staffId)
            .where('weekStartDate', '==', weekStartTimestamp)
            .where('dayOfWeek', '==', dayOfWeek)
            .where('status', '==', 'SUBMITTED')
            .get();

        if (availSnap.empty) {
            throw new Error('No submitted availability for this staff on this day.');
        }

        const availabilityData = availSnap.docs[0].data();
        const timeRanges = availabilityData.timeRanges || [];

        if (!isWithinAvailability(startTime, endTime, timeRanges)) {
            throw new Error('Shift must be within staff availability.');
        }

        // 4. Overlap check on the same day (excluding current shift)
        const existingShiftsSnap = await db.collection('shifts')
            .where('staffId', '==', existingShift.staffId)
            .where('date', '==', existingShift.date)
            .where('status', '==', 'APPROVED')
            .get();

        const existingShifts = existingShiftsSnap.docs
            .filter(doc => doc.id !== shiftId)
            .map(doc => ({
                id: doc.id,
                start: doc.data().startTime,
                end: doc.data().endTime,
            }));

        if (hasOverlap({ start: startTime, end: endTime }, existingShifts)) {
            throw new Error('Shift overlaps with existing shift for this staff on this day.');
        }

        // 5. Update Shift
        const updatePayload = {
            startTime,
            endTime,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedBy: adminUser.id,
        };

        await db.collection('shifts').doc(shiftId).update(updatePayload);

        // 6. Audit Log
        await logAuditEvent({
            actorId: adminUser.id,
            actorRole: adminUser.role,
            action: 'SHIFT_EDIT',
            targetCollection: 'shifts',
            targetDocumentId: shiftId,
            previousValues: {
                startTime: existingShift.startTime,
                endTime: existingShift.endTime,
            },
            newValues: {
                startTime,
                endTime,
            },
        });

        return { success: true };
    } catch (error) {
        console.error('Error in updateShift:', error);
        throw new Error((error as Error).message);
    }
}

/**
 * Removes an existing rostered shift (Admin only).
 */
export async function deleteShift(shiftId: string) {
    try {
        const adminUser = await requireAdmin();
        const db = getAdminDb();

        // 1. Fetch shift to preserve previous values for audit log
        const shiftDoc = await db.collection('shifts').doc(shiftId).get();
        if (!shiftDoc.exists) {
            throw new Error('Shift not found.');
        }
        const shiftData = shiftDoc.data()!;

        // 2. Delete Shift
        await db.collection('shifts').doc(shiftId).delete();

        // 3. Audit Log
        await logAuditEvent({
            actorId: adminUser.id,
            actorRole: adminUser.role,
            action: 'SHIFT_DELETE',
            targetCollection: 'shifts',
            targetDocumentId: shiftId,
            previousValues: {
                staffId: shiftData.staffId,
                date: shiftData.date,
                startTime: shiftData.startTime,
                endTime: shiftData.endTime,
                status: shiftData.status,
            },
        });

        return { success: true };
    } catch (error) {
        console.error('Error in deleteShift:', error);
        throw new Error((error as Error).message);
    }
}
