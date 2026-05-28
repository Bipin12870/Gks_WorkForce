'use server';

import { getAdminDb } from '@/lib/firebase-admin';
import * as admin from 'firebase-admin';
import { requireStaff } from './shared/auth';
import { logAuditEvent } from '@/lib/audit-logger';
import { isWithinShopHours, isTimeBefore, getWeekStartForOffset } from '@/lib/utils';

/**
 * Format date as YYYY-MM-DD without timezone offset drift.
 */
function formatLocalDateKeyServer(date: Date, timezoneOffset: number): string {
    const shifted = new Date(date.getTime() - (timezoneOffset * 60 * 1000));
    const y = shifted.getUTCFullYear();
    const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
    const d = String(shifted.getUTCDate()).padStart(2, '0');
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
    isRecurring: boolean,
    timezoneOffset?: number
) {
    try {
        const user = await requireStaff();
        const db = getAdminDb();

        const offset = timezoneOffset ?? 0;
        const weekStart = getWeekStartForOffset(weekStartDateMs, offset);
        const weekStartStr = formatLocalDateKeyServer(weekStart, offset);
        const weekStartTimestamp = admin.firestore.Timestamp.fromDate(weekStart);

        const weekStartLocalCalendar = new Date(weekStart.getTime() - (offset * 60 * 1000));
        const todayLocalCalendar = new Date(Date.now() - (offset * 60 * 1000));
        todayLocalCalendar.setUTCHours(0, 0, 0, 0);

        const isPastDayServer = (day: number) => {
            const dayDate = new Date(weekStartLocalCalendar.getTime());
            dayDate.setUTCDate(dayDate.getUTCDate() + (day === 0 ? 6 : day - 1));
            dayDate.setUTCHours(0, 0, 0, 0);
            return dayDate.getTime() < todayLocalCalendar.getTime();
        };

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

            // If day is locked or in the past, block any changes
            const isPast = isPastDayServer(dayOfWeek);
            if (lockedDays.has(dayOfWeek) || isPast) {
                // Fetch the existing document to compare
                const existingDoc = await docRef.get();
                const existingData = existingDoc.exists ? existingDoc.data() : null;
                const existingRanges = existingData?.timeRanges || [];

                // Compare ranges (length and start/end times)
                const isDifferent =
                    existingRanges.length !== dayRanges.length ||
                    existingRanges.some((r: TimeRangeInput, idx: number) => r.start !== dayRanges[idx].start || r.end !== dayRanges[idx].end);

                if (isDifferent) {
                    const reason = lockedDays.has(dayOfWeek)
                        ? 'because you have a rostered shift'
                        : 'because it is in the past';
                    throw new Error(`Cannot modify availability on day ${dayOfWeek} ${reason}.`);
                }
                // Skip writing since it's identical and locked/past
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
        return { success: false, error: (error as Error).message };
    }
}
