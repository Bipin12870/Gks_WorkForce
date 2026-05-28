'use server';

import { getAdminDb } from '@/lib/firebase-admin';
import * as admin from 'firebase-admin';
import { requireStaff } from './shared/auth';
import { logAuditEvent } from '@/lib/audit-logger';
import { calculatePayrollServer } from '@/lib/payroll-engine';
import { getWeekStart, isWithinShopHours, getClientLocalDate } from '@/lib/utils';

/**
 * Pure Haversine distance calculator.
 */
function getDistanceMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000; // Earth radius in metres
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Timezone helpers to translate server time (network time) to client's local day/time.
 */

function getClientLocalTimeRounded(serverTimeMs: number, timezoneOffset: number): string {
    const shifted = new Date(serverTimeMs - (timezoneOffset * 60 * 1000));
    const totalMinutes = shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
    const rounded = Math.round(totalMinutes / 5) * 5;
    const h = Math.floor(rounded / 60) % 24;
    const m = rounded % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

async function getMatchingShiftServer(
    db: admin.firestore.Firestore,
    staffId: string,
    clientLocalMidnight: Date
): Promise<admin.firestore.QueryDocumentSnapshot | null> {
    const dateTimestamp = admin.firestore.Timestamp.fromDate(clientLocalMidnight);
    const shiftsSnap = await db.collection('shifts')
        .where('staffId', '==', staffId)
        .where('date', '==', dateTimestamp)
        .where('status', '==', 'APPROVED')
        .get();
    if (shiftsSnap.empty) return null;
    return shiftsSnap.docs[0];
}

/**
 * Clock In Action
 */
export async function clockIn(
    lat: number,
    lng: number,
    accuracy: number,
    clientTimeMs: number,
    timezoneOffset: number
) {
    try {
        const user = await requireStaff();
        const db = getAdminDb();

        const serverNow = Date.now();
        // 1. Clock drift check (max 2 minutes)
        if (Math.abs(serverNow - clientTimeMs) > 120000) {
            throw new Error('Client clock drift detected. Please synchronize your system time.');
        }

        // 2. Accuracy check
        if (accuracy > 150) {
            throw new Error('GPS accuracy too low to clock in.');
        }

        // 3. Prevent double clock-in
        const activeRecords = await db.collection('timeRecords')
            .where('staffId', '==', user.id)
            .where('clockOutTime', '==', null)
            .get();
        if (!activeRecords.empty) {
            throw new Error('You are already clocked in.');
        }

        // 4. Verify clock-in cooling period (5 mins)
        const lastRecords = await db.collection('timeRecords')
            .where('staffId', '==', user.id)
            .orderBy('clockInTime', 'desc')
            .limit(1)
            .get();
        if (!lastRecords.empty) {
            const lastRecord = lastRecords.docs[0].data();
            if (lastRecord.clockOutTime) {
                const clockOutMs = lastRecord.clockOutTime.toDate().getTime();
                const elapsedSecs = Math.floor((serverNow - clockOutMs) / 1000);
                if (elapsedSecs < 300) {
                    throw new Error('Please wait for the cooling period to expire before clocking in again.');
                }
            }
        }

        // 5. Geofence validation on the server
        const shopDoc = await db.collection('config').doc('shopLocation').get();
        if (!shopDoc.exists) {
            throw new Error('Shop location is not configured.');
        }
        const shop = shopDoc.data()!;
        const distance = getDistanceMetres(lat, lng, shop.lat, shop.lng);
        const withinRange = distance <= shop.radiusMetres;
        if (!withinRange) {
            throw new Error(`Out of range: You are ${Math.round(distance)}m from the shop (radius is ${shop.radiusMetres}m).`);
        }

        // 6. Rounding and shop hours check
        const clockInRounded = getClientLocalTimeRounded(serverNow, timezoneOffset);
        if (!isWithinShopHours(clockInRounded)) {
            throw new Error(`Clock-in is only allowed between 09:00 and 23:59.`);
        }

        // 7. Find matching shift
        const clientLocalMidnight = getClientLocalDate(serverNow, timezoneOffset);
        let shift = await getMatchingShiftServer(db, user.id, clientLocalMidnight);

        // Check if this shift has already been completed (has a completed timeRecord)
        if (shift) {
            const completedRecords = await db.collection('timeRecords')
                .where('staffId', '==', user.id)
                .where('shiftId', '==', shift.id)
                .get();

            const hasCompleted = completedRecords.docs.some(doc => doc.data().clockOutTime !== null);
            if (hasCompleted) {
                // Roster shift was already completed/auto-closed today. Treat this clock-in as unscheduled.
                shift = null;
            }
        }

        // 8. Create time record
        const recordPayload = {
            staffId: user.id,
            clockInTime: admin.firestore.Timestamp.fromMillis(serverNow),
            clockInRounded,
            clockInLat: lat,
            clockInLng: lng,
            clockInAccuracy: accuracy,
            clockOutTime: null,
            clockOutRounded: null,
            clockOutLat: null,
            clockOutLng: null,
            clockOutAccuracy: null,
            clockOutWithinGeofence: null,
            hoursWorked: null,
            shiftId: shift ? shift.id : null,
            timesheetId: null,
            source: 'GPS',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        const docRef = await db.collection('timeRecords').add(recordPayload);

        // 9. Log audit log
        await logAuditEvent({
            actorId: user.id,
            actorRole: user.role,
            action: 'CLOCK_IN',
            targetCollection: 'timeRecords',
            targetDocumentId: docRef.id,
            newValues: {
                clockInRounded,
                shiftId: shift ? shift.id : null,
            },
        });

        return { success: true, id: docRef.id };
    } catch (error) {
        console.error('Error in clockIn action:', error);
        throw new Error((error as Error).message);
    }
}

/**
 * Clock Out Action
 */
export async function clockOut(
    activeRecordId: string,
    lat: number,
    lng: number,
    accuracy: number,
    isAutoClose: boolean,
    clientTimeMs: number,
    timezoneOffset: number
) {
    try {
        const user = await requireStaff();
        const db = getAdminDb();

        const serverNow = Date.now();
        // 1. Clock drift check (max 2 minutes) if not auto-closing
        if (!isAutoClose && Math.abs(serverNow - clientTimeMs) > 120000) {
            throw new Error('Client clock drift detected. Please synchronize your system time.');
        }

        // 2. Fetch active record
        const recordDoc = await db.collection('timeRecords').doc(activeRecordId).get();
        if (!recordDoc.exists) {
            throw new Error('Active time record not found.');
        }
        const recordData = recordDoc.data()!;
        const clientLocalMidnight = getClientLocalDate(recordData.clockInTime.toDate().getTime(), timezoneOffset);

        // 3. Auth validation
        if (recordData.staffId !== user.id && user.role !== 'ADMIN') {
            throw new Error('Unauthorized.');
        }

        if (recordData.clockOutTime !== null) {
            // Already clocked out — return success gracefully to handle multi-device synchronization
            return { success: true, timesheetId: recordData.timesheetId || '' };
        }

        // 4. Verify clock-out cooling lock (60 seconds) if not auto-closing
        if (!isAutoClose) {
            const clockInMs = recordData.clockInTime.toDate().getTime();
            const elapsedSecs = Math.floor((serverNow - clockInMs) / 1000);
            if (elapsedSecs < 60) {
                throw new Error('Please wait at least 60 seconds before clocking out.');
            }
        }

        // 5. Fetch shop config
        const shopDoc = await db.collection('config').doc('shopLocation').get();
        if (!shopDoc.exists) {
            throw new Error('Shop location is not configured.');
        }
        const shop = shopDoc.data()!;

        // 6. Find shift
        let shift = null;
        const shiftId = recordData.shiftId || null;
        if (shiftId) {
            const shiftDoc = await db.collection('shifts').doc(shiftId).get();
            shift = shiftDoc.exists ? shiftDoc.data() : null;
        }

        // 7. Calculate clock-out times
        let clockOutRounded: string;
        let clockOutTimestamp: admin.firestore.Timestamp;
        if (isAutoClose && shift) {
            clockOutRounded = shift.endTime;
            const [eh, em] = shift.endTime.split(':').map(Number);
            const shiftEndDate = new Date(clientLocalMidnight);
            shiftEndDate.setHours(eh, em, 0, 0);
            clockOutTimestamp = admin.firestore.Timestamp.fromDate(shiftEndDate);
        } else {
            clockOutRounded = getClientLocalTimeRounded(serverNow, timezoneOffset);
            clockOutTimestamp = admin.firestore.Timestamp.fromMillis(serverNow);
        }

        // 8. Distance calculation
        let distanceMetres: number | null = null;
        let withinRange: boolean | null = null;
        if (!isAutoClose) {
            distanceMetres = Math.round(getDistanceMetres(lat, lng, shop.lat, shop.lng));
            withinRange = distanceMetres <= shop.radiusMetres;
        }

        // 9. Run Server-Side Payroll/Automation Engine
        const gpsEvents = [];
        if (!isAutoClose && distanceMetres !== null && distanceMetres > shop.radiusMetres) {
            gpsEvents.push({ type: 'OUTSIDE' as const, time: clockOutRounded });
        }

        const automationResult = calculatePayrollServer({
            clockIn: recordData.clockInRounded,
            clockOut: clockOutRounded,
            roster: shift ? { start: shift.startTime, end: shift.endTime } : undefined,
            gpsEvents,
            isManualEdit: false,
        });

        const hoursWorked = automationResult.payroll.rawMinutes / 60;

        // 10. Map source
        let source: string = 'GPS_UNMATCHED';
        let requiresNote = false;

        if (isAutoClose) {
            source = 'AUTO_CLOSED';
            requiresNote = true;
        } else {
            if (automationResult.approval.status === 'FLAGGED' || automationResult.approval.status === 'NEEDS_REVIEW') {
                requiresNote = true;
                if (automationResult.classification.flags.includes('GPS_OUTSIDE')) {
                    source = 'GPS_OUTSIDE';
                } else if (automationResult.classification.flags.includes('OVERTIME')) {
                    source = 'GPS_OVERTIME';
                } else if (automationResult.classification.flags.includes('AFTER_HOURS')) {
                    source = 'AFTER_HOURS';
                } else if (shift) {
                    source = 'GPS_VERIFIED';
                }
            } else if (shift) {
                source = 'GPS_VERIFIED';
            }
        }

        const finalStatus = automationResult.approval.status === 'AUTO_APPROVED' ? 'APPROVED' : 'PENDING';

        // 11. Transaction: Update TimeRecord and Timesheet
        const recordRef = db.collection('timeRecords').doc(activeRecordId);
        let timesheetId = '';

        await db.runTransaction(async (transaction) => {
            // Check if there is an existing timesheet for this shift to overwrite (duplicate clock cases)
            if (shiftId) {
                const tsSnap = await db.collection('timesheets')
                    .where('staffId', '==', recordData.staffId)
                    .where('shiftId', '==', shiftId)
                    .get();

                if (!tsSnap.empty) {
                    const tsDoc = tsSnap.docs[0];
                    timesheetId = tsDoc.id;
                    transaction.update(tsDoc.ref, {
                        workedStart: recordData.clockInRounded,
                        workedEnd: clockOutRounded,
                        source,
                        timeRecordId: activeRecordId,
                        clockInLat: recordData.clockInLat,
                        clockInLng: recordData.clockInLng,
                        clockOutLat: isAutoClose ? null : lat,
                        clockOutLng: isAutoClose ? null : lng,
                        clockOutDistanceMetres: distanceMetres,
                        requiresAdminNote: requiresNote,
                        status: finalStatus,
                        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    });
                }
            }

            // Create a new timesheet if none existed/matched
            if (!timesheetId) {
                const clockInDateObj = recordData.clockInTime.toDate();
                const weekStartDateVal = getWeekStart(clockInDateObj);

                const timesheetRef = db.collection('timesheets').doc();
                timesheetId = timesheetRef.id;

                transaction.set(timesheetRef, {
                    staffId: recordData.staffId,
                    shiftId: shiftId || null,
                    date: admin.firestore.Timestamp.fromDate(clientLocalMidnight),
                    weekStartDate: admin.firestore.Timestamp.fromDate(weekStartDateVal),
                    approvedShiftStart: shift ? shift.startTime : '',
                    approvedShiftEnd: shift ? shift.endTime : '',
                    workedStart: recordData.clockInRounded,
                    workedEnd: clockOutRounded,
                    status: finalStatus,
                    source,
                    timeRecordId: activeRecordId,
                    clockInLat: recordData.clockInLat,
                    clockInLng: recordData.clockInLng,
                    clockOutLat: isAutoClose ? null : lat,
                    clockOutLng: isAutoClose ? null : lng,
                    clockOutDistanceMetres: distanceMetres,
                    requiresAdminNote: requiresNote,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                });
            }

            // Update timeRecord with clockout info and generated timesheetId
            transaction.update(recordRef, {
                clockOutTime: clockOutTimestamp,
                clockOutRounded,
                clockOutLat: isAutoClose ? null : lat,
                clockOutLng: isAutoClose ? null : lng,
                clockOutAccuracy: isAutoClose ? null : accuracy,
                clockOutWithinGeofence: isAutoClose ? null : withinRange,
                hoursWorked,
                source: isAutoClose ? 'AUTO_CLOSED' : 'GPS',
                shiftId: shiftId || null,
                timesheetId,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        });

        // 12. Log audit log
        await logAuditEvent({
            actorId: user.id,
            actorRole: user.role,
            action: isAutoClose ? 'AUTO_CLOCK_OUT' : 'CLOCK_OUT',
            targetCollection: 'timeRecords',
            targetDocumentId: activeRecordId,
            newValues: {
                clockOutRounded,
                timesheetId,
                hoursWorked,
                source,
                status: finalStatus,
            },
        });

        return { success: true, timesheetId };
    } catch (error) {
        console.error('Error in clockOut action:', error);
        throw new Error((error as Error).message);
    }
}
