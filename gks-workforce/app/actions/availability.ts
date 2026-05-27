'use server';

import { getAdminDb } from '@/lib/firebase-admin';
import * as admin from 'firebase-admin';
import { requireStaff } from './shared/auth';
import { logAuditEvent } from '@/lib/audit-logger';
import { getWeekStart, parseTime, isWithinShopHours, isTimeBefore } from '@/lib/utils';

/**
 * Format date as YYYY-MM-DD without timezone offset drift.
 */
function formatLocalDateKeyServer(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

interface TimeRangeInput {
    start: string;
    end: string;
}

/**
 * Submits availability for a given week (Staff only).
 * Validates range overlaps, shop hours, and enforces day-locks for rostered shifts.
 */
export async function submitAvailability(
    weekStartDateMs: number,
    availabilityData: Record<number, TimeRangeInput[]>,
    isRecurring: boolean
) {
    try {
        const user = await requireStaff();
        const db = getAdminDb();

        const selectedWeek = new Date(weekStartDateMs);
        const weekStart = getWeekStart(selectedWeek);
        const weekStartStr = formatLocalDateKeyServer(weekStart);
        const weekStartTimestamp = admin.firestore.Timestamp.fromDate(weekStart);

        // 1. Enforce day-locks: Get all approved shifts for this user in this week
        const nextWeek = new Date(weekStart);
        nextWeek.setDate(nextWeek.getDate() + 7);
        const nextWeekTimestamp = admin.firestore.Timestamp.fromDate(nextWeek);

        const shiftsSnap = await db.collection('shifts')
            .where('staffId', '==', user.id)
            .where('date', '>=', weekStartTimestamp)
            .where('date', '<', nextWeekTimestamp)
            .where('status', '==', 'APPROVED')
            .get();

        const lockedDays = new Set<number>();
        shiftsSnap.docs.forEach((doc) => {
            lockedDays.add(doc.data().date.toDate().getDay());
        });

        // 2. Validate availability inputs
        const cleanedAvailability: Record<number, TimeRangeInput[]> = {};

        for (let day = 0; day < 7; day++) {
            const ranges = availabilityData[day] || [];
            if (ranges.length === 0) {
                cleanedAvailability[day] = [];
                continue;
            }

            // Sort ranges by start time
            const sortedRanges = [...ranges].sort((a, b) => (isTimeBefore(a.start, b.start) ? -1 : 1));

            // Validate shop hours and durations
            for (const r of sortedRanges) {
                if (!isWithinShopHours(r.start) || !isWithinShopHours(r.end)) {
                    throw new Error(`Availability must be within shop hours (09:00 - 23:59).`);
                }
                if (!isTimeBefore(r.start, r.end)) {
                    throw new Error(`Invalid duration: End time must be after start time.`);
                }
            }

            // Validate overlaps or touches
            for (let i = 1; i < sortedRanges.length; i++) {
                const prev = sortedRanges[i - 1];
                const curr = sortedRanges[i];
                if (!isTimeBefore(prev.end, curr.start)) {
                    throw new Error(`Time ranges overlap or touch on day ${day}.`);
                }
            }

            cleanedAvailability[day] = sortedRanges;
        }

        // 3. Process daily availability writes/deletes
        const batch = db.batch();
        const docIdsToLog: string[] = [];

        for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
            const dayId = `${user.id}_${weekStartStr}_${dayOfWeek}`;
            const docRef = db.collection('availability').doc(dayId);
            const dayRanges = cleanedAvailability[dayOfWeek] || [];

            // If day is locked, block any changes
            if (lockedDays.has(dayOfWeek)) {
                // Fetch the existing document to compare
                const existingDoc = await docRef.get();
                const existingData = existingDoc.exists ? existingDoc.data() : null;
                const existingRanges = existingData?.timeRanges || [];

                // Compare ranges (length and start/end times)
                const isDifferent =
                    existingRanges.length !== dayRanges.length ||
                    existingRanges.some((r: any, idx: number) => r.start !== dayRanges[idx].start || r.end !== dayRanges[idx].end);

                if (isDifferent) {
                    throw new Error(`Cannot modify availability on day ${dayOfWeek} because you have a rostered shift.`);
                }
                // Skip writing since it's identical and locked
                continue;
            }

            if (dayRanges.length > 0) {
                const existingDoc = await docRef.get();
                const createdAtVal = existingDoc.exists
                    ? existingDoc.data()!.createdAt
                    : admin.firestore.FieldValue.serverTimestamp();

                batch.set(docRef, {
                    staffId: user.id,
                    weekStartDate: weekStartTimestamp,
                    dayOfWeek,
                    timeRanges: dayRanges,
                    isRecurring,
                    status: 'SUBMITTED',
                    submittedAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    createdAt: createdAtVal,
                });
                docIdsToLog.push(dayId);
            } else {
                batch.delete(docRef);
            }
        }

        // 4. Commit Firestore operations
        await batch.commit();

        // 5. Log Audit Event
        await logAuditEvent({
            actorId: user.id,
            actorRole: user.role,
            action: 'AVAILABILITY_SUBMIT',
            targetCollection: 'availability',
            targetDocumentId: `${user.id}_${weekStartStr}`,
            newValues: {
                isRecurring,
                weekStartDate: weekStartTimestamp,
                daysSubmitted: docIdsToLog,
            },
        });

        return { success: true };
    } catch (error) {
        console.error('Error in submitAvailability server action:', error);
        throw new Error((error as Error).message);
    }
}
