'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNotification } from '@/contexts/NotificationContext';
import { db } from '@/lib/firebase';
import { collection, addDoc, query, where, getDocs, updateDoc, doc, Timestamp, orderBy, limit } from 'firebase/firestore';
import { TimeRecord, Timesheet, Shift, ShopLocation, TimesheetSource, TimesheetStatus } from '@/types';
import { getShopLocation, formatTimeToHHmm, getDistanceMetres, isSignificantOvertime } from '@/lib/geofence';
import { getWeekStart, processTimesheetAutomation, isWithinShopHours, SHOP_OPEN_TIME, SHOP_CLOSE_TIME } from '@/lib/utils';
import StaffPageShell from '@/components/staff/StaffPageShell';
import StaffAlert from '@/components/staff/StaffAlert';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Modal from '@/components/ui/Modal';
import Spinner from '@/components/ui/Spinner';
import Icon from '@/components/ui/Icon';
import {
    AlertTriangle,
    Clock,
    Loader2,
    MapPin,
    MapPinOff,
    Navigation,
} from 'lucide-react';

interface GeoState {
    lat: number;
    lng: number;
    accuracy: number;
    distanceMetres: number | null;
    withinRange: boolean | null;
}

export default function ClockInOutPage() {
    const { userData } = useAuth();
    const { showNotification } = useNotification();

    const [activeRecord, setActiveRecord] = useState<TimeRecord | null>(null);
    const [shop, setShop] = useState<ShopLocation | null>(null);
    const [geo, setGeo] = useState<GeoState | null>(null);
    const [geoError, setGeoError] = useState<string | null>('Waiting for location...');
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [todayShift, setTodayShift] = useState<Shift | null>(null);
    const [hasCheckedShift, setHasCheckedShift] = useState(false);
    const [clockInCoolingRemaining, setClockInCoolingRemaining] = useState<number>(0);
    const [clockOutCoolingRemaining, setClockOutCoolingRemaining] = useState<number>(0);
    const [shiftDurationSeconds, setShiftDurationSeconds] = useState<number>(0);
    const [shiftDiffMins, setShiftDiffMins] = useState<number | null>(null);
    const [confirmModalData, setConfirmModalData] = useState<{
        title: string;
        message: string;
        type: 'early' | 'late' | 'unscheduled';
    } | null>(null);

    const watchIdRef = useRef<number | null>(null);

    // ─────────────────────────────────────────────────────────
    // Countdown Timer for Cooling Locks & Active Shift Duration
    // ─────────────────────────────────────────────────────────
    useEffect(() => {
        const interval = setInterval(() => {
            setClockInCoolingRemaining((prev) => (prev > 0 ? prev - 1 : 0));
            setClockOutCoolingRemaining((prev) => (prev > 0 ? prev - 1 : 0));

            if (activeRecord) {
                const elapsedMs = Date.now() - activeRecord.clockInTime.toMillis();
                setShiftDurationSeconds(Math.max(0, Math.floor(elapsedMs / 1000)));
                setShiftDiffMins(null);
            } else {
                setShiftDurationSeconds(0);
                if (todayShift) {
                    const now = new Date();
                    const [sh, sm] = todayShift.startTime.split(':').map(Number);
                    const shiftStart = new Date(todayShift.date.toDate());
                    shiftStart.setHours(sh, sm, 0, 0);
                    const diffMs = now.getTime() - shiftStart.getTime();
                    setShiftDiffMins(Math.round(diffMs / (1000 * 60)));
                } else {
                    setShiftDiffMins(null);
                }
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [activeRecord, todayShift]);

    const formatDuration = (totalSeconds: number) => {
        const hrs = Math.floor(totalSeconds / 3600);
        const mins = Math.floor((totalSeconds % 3600) / 60);
        const secs = totalSeconds % 60;
        
        if (hrs > 0) {
            return `${hrs}h ${mins}m ${secs}s`;
        }
        return `${mins}m ${secs}s`;
    };

    // ─────────────────────────────────────────────────────────
    // Helper to find rostered shift
    // ─────────────────────────────────────────────────────────
    const getMatchingShift = async (clockInTimeMs: number): Promise<Shift | null> => {
        if (!userData) return null;
        
        // Find 00:00 of the day the staff clocked in
        const clockInDate = new Date(clockInTimeMs);
        clockInDate.setHours(0, 0, 0, 0);
        const dateTimestamp = Timestamp.fromDate(clockInDate);

        const q = query(
            collection(db, 'shifts'),
            where('staffId', '==', userData.id),
            where('date', '==', dateTimestamp),
            where('status', '==', 'APPROVED')
        );
        const snap = await getDocs(q);
        if (snap.empty) return null;
        
        // If there are multiple shifts, we should pick the most relevant one.
        // For now, we assume one shift per person per day.
        const shift = { id: snap.docs[0].id, ...snap.docs[0].data() } as Shift;
        
        // RELAXED MATCHING LOGIC:
        // As long as the staff clocks in on the SAME DAY as the rostered shift, 
        // we attach it to that shift. This handles extreme lateness correctly.
        return shift;
    };

    // ─────────────────────────────────────────────────────────
    // 1. INIT: Load shop config & active records
    // ─────────────────────────────────────────────────────────
    useEffect(() => {
        if (!userData) return;

        const init = async () => {
            try {
                const shopLoc = await getShopLocation();
                setShop(shopLoc);
                if (!shopLoc) {
                    setGeoError('No shop location configured by Admin. Cannot use GPS clock.');
                }
                await checkActiveClockIn();
                
                // Fetch today's rostered shift to show warning if not rostered
                const shift = await getMatchingShift(Date.now());
                setTodayShift(shift);
                setHasCheckedShift(true);
            } catch (err) {
                console.error(err);
                showNotification('Failed to load configuration.', 'error');
            } finally {
                setLoading(false);
            }
        };
        init();

        return () => {
            if (watchIdRef.current !== null) {
                navigator.geolocation.clearWatch(watchIdRef.current);
            }
        };
    }, [userData]);

    // ─────────────────────────────────────────────────────────
    // 2. GPS WATCHER
    // ─────────────────────────────────────────────────────────
    useEffect(() => {
        if (!shop) return;
        if (!navigator.geolocation) {
            setGeoError('Geolocation not supported by your browser.');
            return;
        }

        setGeoError(null);
        watchIdRef.current = navigator.geolocation.watchPosition(
            (pos) => {
                const dist = getDistanceMetres(pos.coords.latitude, pos.coords.longitude, shop.lat, shop.lng);
                setGeo({
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude,
                    accuracy: pos.coords.accuracy,
                    distanceMetres: Math.round(dist),
                    withinRange: dist <= shop.radiusMetres,
                });
                setGeoError(null);
            },
            (err) => {
                setGeoError(`Location access denied or unavailable (${err.message})`);
            },
            { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
        );
    }, [shop]);

    const checkActiveClockIn = async () => {
        if (!userData) return;

        const q = query(
            collection(db, 'timeRecords'),
            where('staffId', '==', userData.id),
            where('clockOutTime', '==', null)
        );

        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
            const docSnap = snapshot.docs[0];
            const record = { id: docSnap.id, ...docSnap.data() } as TimeRecord;
            
            // CHECK AUTO-CLOSE
            const shift = await getMatchingShift(record.clockInTime.toMillis());
            if (shift) {
                const shiftEnd = new Date(shift.date.toDate());
                const [eh, em] = shift.endTime.split(':').map(Number);
                shiftEnd.setHours(eh, em, 0, 0);
                
                // Auto close time = shift end + 30 mins
                const autoCloseTimeMs = shiftEnd.getTime() + 1 * 60 * 1000;
                const nowMs = Date.now();

                if (nowMs > autoCloseTimeMs) {
                    // IT'S STALE — AUTO CLOSE IT
                    await processClockOut(record, shift, true);
                    return;
                }
            }

            setActiveRecord(record);

            // Clock-out lock: Must wait 60s since clock-in
            const clockInMs = record.clockInTime.toMillis();
            const elapsedSecs = Math.floor((Date.now() - clockInMs) / 1000);
            const remaining = 60 - elapsedSecs;
            if (remaining > 0) {
                setClockOutCoolingRemaining(remaining);
            } else {
                setClockOutCoolingRemaining(0);
            }
            return;
        }

        setActiveRecord(null);

        // Fetch last completed record to check clock-in cooling lock (5 mins / 300 seconds)
        const lastQ = query(
            collection(db, 'timeRecords'),
            where('staffId', '==', userData.id),
            orderBy('clockInTime', 'desc'),
            limit(1)
        );
        const lastSnap = await getDocs(lastQ);
        if (!lastSnap.empty) {
            const lastRecord = lastSnap.docs[0].data() as TimeRecord;
            if (lastRecord.clockOutTime) {
                const clockOutMs = lastRecord.clockOutTime.toMillis();
                const elapsedSecs = Math.floor((Date.now() - clockOutMs) / 1000);
                const remaining = 300 - elapsedSecs;
                if (remaining > 0) {
                    setClockInCoolingRemaining(remaining);
                } else {
                    setClockInCoolingRemaining(0);
                }
            }
        }
    };

    // ─────────────────────────────────────────────────────────
    // 4. PROCESS CLOCK OUT (Manual or Auto-close)
    // ─────────────────────────────────────────────────────────
    const processClockOut = async (
        record: TimeRecord, 
        shift: Shift | null, 
        isAutoClose: boolean
    ) => {
        if (!userData) return;

        const now = new Date();
        const clockOutTime = isAutoClose ? null : Timestamp.now();
        
        // For auto-close, use the shift's end time. Otherwise use current rounded time.
        let clockOutRounded = isAutoClose && shift ? shift.endTime : formatTimeToHHmm(now);

        const clockInDate = record.clockInTime.toDate();
        const [ih, im] = record.clockInRounded.split(':').map(Number);
        clockInDate.setHours(ih, im, 0, 0);

        const automationResult = processTimesheetAutomation(
            record.clockInRounded, 
            clockOutRounded, 
            shift ? { start: shift.startTime, end: shift.endTime } : undefined,
            (geo && shop && geo.distanceMetres !== null && geo.distanceMetres > shop.radiusMetres) 
                ? [{ type: 'OUTSIDE', time: clockOutRounded }] 
                : [],
            false // isManualEdit
        );

        const hoursWorked = automationResult.payroll.rawMinutes / 60;

        let source: TimesheetSource = 'GPS_UNMATCHED';
        let requiresNote = false;

        if (isAutoClose) {
            source = 'AUTO_CLOSED';
            requiresNote = true;
        } else {
            // Map automation status/flags back to legacy source types for DB compatibility
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

        // 3. Automated Approval Handling
        let finalStatus: TimesheetStatus = 'PENDING';
        if (automationResult.approval.status === 'AUTO_APPROVED') {
            finalStatus = 'APPROVED';
        }

        // 1. Update TimeRecord
        const recordRef = doc(db, 'timeRecords', record.id!);
        await updateDoc(recordRef, {
            clockOutTime: Timestamp.now(),
            clockOutRounded,
            clockOutLat: geo?.lat ?? null,
            clockOutLng: geo?.lng ?? null,
            clockOutAccuracy: geo?.accuracy ?? null,
            clockOutWithinGeofence: geo?.withinRange ?? null,
            hoursWorked,
            source: isAutoClose ? 'AUTO_CLOSED' : 'GPS',
            shiftId: shift ? shift.id : null,
            updatedAt: Timestamp.now(),
        });

        // 2. Auto-generate Timesheet (or update existing if duplicate)
        let timesheetId = '';
        if (shift) {
            const tsQ = query(
                collection(db, 'timesheets'),
                where('staffId', '==', userData.id),
                where('shiftId', '==', shift.id)
            );
            const tsSnap = await getDocs(tsQ);
            if (!tsSnap.empty) {
                const tsDoc = tsSnap.docs[0];
                timesheetId = tsDoc.id;
                await updateDoc(doc(db, 'timesheets', timesheetId), {
                    workedStart: record.clockInRounded,
                    workedEnd: clockOutRounded,
                    source,
                    timeRecordId: record.id!,
                    clockInLat: record.clockInLat,
                    clockInLng: record.clockInLng,
                    clockOutLat: geo?.lat ?? null,
                    clockOutLng: geo?.lng ?? null,
                    clockOutDistanceMetres: geo?.distanceMetres ?? null,
                    requiresAdminNote: requiresNote,
                    status: finalStatus,
                    updatedAt: Timestamp.now(),
                });
            }
        }

        if (!timesheetId) {
            const timesheetPayload: Omit<Timesheet, 'id'> = {
                staffId: userData.id,
                shiftId: shift ? shift.id! : null,
                date: Timestamp.fromDate(clockInDate),
                weekStartDate: Timestamp.fromDate(getWeekStart(clockInDate)),
                approvedShiftStart: shift ? shift.startTime : '',
                approvedShiftEnd: shift ? shift.endTime : '',
                workedStart: record.clockInRounded,
                workedEnd: clockOutRounded,
                status: finalStatus,
                source,
                timeRecordId: record.id!,
                clockInLat: record.clockInLat,
                clockInLng: record.clockInLng,
                clockOutLat: geo?.lat ?? null,
                clockOutLng: geo?.lng ?? null,
                clockOutDistanceMetres: geo?.distanceMetres ?? null,
                requiresAdminNote: requiresNote,
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
            };

            const tsRef = await addDoc(collection(db, 'timesheets'), timesheetPayload);
            timesheetId = tsRef.id;
        }

        await updateDoc(recordRef, { timesheetId });

        if (isAutoClose) {
            showNotification('Your previous open shift was auto-closed.', 'error');
            setActiveRecord(null);
            setClockInCoolingRemaining(0);
        } else {
            showNotification(`Clocked out. Timesheet generated (${clockOutRounded}).`, 'success');
            setActiveRecord(null);
            setClockInCoolingRemaining(300);
        }
    };

    // ─────────────────────────────────────────────────────────
    // 5. BUTTON HANDLERS
    // ─────────────────────────────────────────────────────────
    const handleClockIn = async (force: boolean = false) => {
        if (!userData || !geo || !geo.withinRange) return;
        if (clockInCoolingRemaining > 0) {
            showNotification('Please wait for the cooling period to expire.', 'error');
            return;
        }
        if (geo.accuracy > 150) {
            showNotification('GPS accuracy too low to clock in.', 'error');
            return;
        }

        if (!force) {
            if (!todayShift) {
                setConfirmModalData({
                    title: 'Unscheduled Shift',
                    message: 'You are not rostered for a shift today. Clocking in will record this as an Emergency / Unscheduled shift and will require Admin approval.',
                    type: 'unscheduled'
                });
                return;
            } else if (shiftDiffMins !== null && shiftDiffMins < -5) {
                setConfirmModalData({
                    title: 'Starting Early',
                    message: `You are clocking in early. Your rostered shift starts at ${todayShift.startTime} (in ${Math.abs(shiftDiffMins)} minutes). Do you want to proceed?`,
                    type: 'early'
                });
                return;
            } else if (shiftDiffMins !== null && shiftDiffMins > 5) {
                setConfirmModalData({
                    title: 'Running Late',
                    message: `You are clocking in late. Your rostered shift was scheduled to start at ${todayShift.startTime} (${shiftDiffMins} minutes ago). Do you want to proceed?`,
                    type: 'late'
                });
                return;
            }
        }

        setConfirmModalData(null);
        setProcessing(true);
        try {
            const now = new Date();
            const clockInTime = formatTimeToHHmm(now);

            if (!isWithinShopHours(clockInTime)) {
                showNotification(`Clock-in is only allowed between ${SHOP_OPEN_TIME} and ${SHOP_CLOSE_TIME}`, 'error');
                setLoading(false);
                return;
            }

            const shift = await getMatchingShift(now.getTime());

            const payload: Omit<TimeRecord, 'id'> = {
                staffId: userData.id,
                clockInTime: Timestamp.now(),
                clockInRounded: formatTimeToHHmm(now),
                clockInLat: geo.lat,
                clockInLng: geo.lng,
                clockInAccuracy: geo.accuracy,
                clockOutTime: null,
                clockOutRounded: null,
                clockOutLat: null,
                clockOutLng: null,
                clockOutAccuracy: null,
                clockOutWithinGeofence: null,
                hoursWorked: null,
                shiftId: shift ? shift.id! : null,
                timesheetId: null,
                source: 'GPS',
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
            };

            await addDoc(collection(db, 'timeRecords'), payload);
            showNotification('Clocked in successfully!', 'success');
            setClockOutCoolingRemaining(60); // 1 minute safety clock-out lock
            await checkActiveClockIn();
        } catch (error) {
            console.error('Error clocking in:', error);
            showNotification('Failed to clock in.', 'error');
        } finally {
            setProcessing(false);
        }
    };

    const handleClockOut = async () => {
        if (!userData || !activeRecord) return;
        if (clockOutCoolingRemaining > 0) {
            showNotification('Please wait before clocking out.', 'error');
            return;
        }
        setProcessing(true);
        try {
            const shift = await getMatchingShift(activeRecord.clockInTime.toMillis());
            await processClockOut(activeRecord, shift, false);
        } catch (error) {
            console.error('Error clocking out:', error);
            showNotification('Failed to clock out.', 'error');
        } finally {
            setProcessing(false);
        }
    };

    // ─────────────────────────────────────────────────────────
    // RENDER
    // ─────────────────────────────────────────────────────────
    const gpsAlert = () => {
        if (geoError) {
            return (
                <StaffAlert variant="danger" icon={MapPinOff} title="GPS error">
                    {geoError}
                </StaffAlert>
            );
        }
        if (!geo) {
            return (
                <StaffAlert variant="warning" icon={Loader2} title="Locating...">
                    Acquiring GPS signal...
                </StaffAlert>
            );
        }
        if (geo.withinRange) {
            return (
                <StaffAlert variant="success" icon={MapPin} title="In range">
                    {geo.distanceMetres}m from shop
                    {geo.accuracy > 50 && (
                        <p className="text-amber-700 mt-1">Poor accuracy ({Math.round(geo.accuracy)}m)</p>
                    )}
                </StaffAlert>
            );
        }
        return (
            <StaffAlert variant="warning" icon={Navigation} title="Out of range">
                {geo.distanceMetres}m from shop — move closer to clock in
            </StaffAlert>
        );
    };

    if (loading) {
        return (
            <StaffPageShell title="Time Clock" maxWidth="md" centered>
                <Spinner className="py-24" />
            </StaffPageShell>
        );
    }

    return (
        <StaffPageShell title="Time Clock" maxWidth="md" centered headerCentered>
            <Card className="w-full p-6 sm:p-8 space-y-6">
                {gpsAlert()}

                {activeRecord ? (
                    <div className="text-center space-y-6">
                        <div className="p-6 border border-blue-200 bg-blue-50/50 rounded-xl">
                            <p className="text-label text-blue-800 mb-1">Active session</p>
                            <p className="text-stat">{formatDuration(shiftDurationSeconds)}</p>
                            <div className="flex justify-center items-center gap-1.5 mt-2 text-xs text-blue-700 font-medium">
                                <span className="inline-block w-1.5 h-1.5 bg-blue-600 rounded-full motion-reduce:animate-none animate-ping" />
                                <span>
                                    Started at{' '}
                                    {activeRecord.clockInTime.toDate().toLocaleTimeString([], {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                    })}
                                </span>
                            </div>
                            <p className="text-label mt-1">Rounded in: {activeRecord.clockInRounded}</p>
                        </div>

                        <Button
                            variant="danger"
                            size="lg"
                            fullWidth
                            onClick={handleClockOut}
                            disabled={processing || clockOutCoolingRemaining > 0}
                        >
                            {processing ? 'Processing...' : 'Clock out'}
                        </Button>
                        {clockOutCoolingRemaining > 0 && (
                            <p className="text-xs text-amber-700 text-center">
                                Please wait {clockOutCoolingRemaining}s before clocking out (safety lock).
                            </p>
                        )}
                        {clockOutCoolingRemaining === 0 && geo && !geo.withinRange && (
                            <p className="text-xs text-orange-700 text-center">
                                You are clocking out off-site. Rostered end time will apply.
                            </p>
                        )}
                    </div>
                ) : (
                    <div className="text-center space-y-6">
                        {geo && geo.accuracy > 150 && (
                            <StaffAlert variant="danger" icon={AlertTriangle} title="Low GPS accuracy">
                                Your accuracy is {Math.round(geo.accuracy)}m. Move to an open area and wait for the
                                signal to stabilize.
                            </StaffAlert>
                        )}
                        {clockInCoolingRemaining > 0 && (
                            <StaffAlert variant="info" icon={Loader2} title="Cooling period active">
                                Please wait {Math.floor(clockInCoolingRemaining / 60)}m{' '}
                                {clockInCoolingRemaining % 60}s before clocking in again.
                            </StaffAlert>
                        )}
                        {(!geo || geo.accuracy <= 150) && clockInCoolingRemaining === 0 && (
                            <div className="py-8 px-4 bg-gray-50 border border-dashed border-gray-200 rounded-xl">
                                <p className="text-sm text-gray-600 font-medium">Ready to start your shift</p>
                                {todayShift && (
                                    <p className="text-label mt-2">
                                        Rostered: {todayShift.startTime} – {todayShift.endTime}
                                    </p>
                                )}
                            </div>
                        )}

                        <Button
                            variant="primary"
                            size="lg"
                            fullWidth
                            onClick={() => handleClockIn(false)}
                            disabled={
                                processing ||
                                !geo?.withinRange ||
                                !!geoError ||
                                clockInCoolingRemaining > 0 ||
                                (geo !== null && geo.accuracy > 150)
                            }
                        >
                            {processing ? 'Processing...' : 'Clock in'}
                        </Button>
                    </div>
                )}
            </Card>

            <Modal
                open={!!confirmModalData}
                onClose={() => setConfirmModalData(null)}
                title={confirmModalData?.title ?? ''}
                description={confirmModalData?.message}
                icon={
                    <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center border border-amber-200">
                        <Icon
                            icon={confirmModalData?.type === 'late' ? Clock : AlertTriangle}
                            size="lg"
                            className="text-amber-600"
                        />
                    </div>
                }
                secondaryAction={{ label: 'Cancel', onClick: () => setConfirmModalData(null) }}
                primaryAction={{ label: 'Proceed', onClick: () => handleClockIn(true) }}
            />
        </StaffPageShell>
    );
}
