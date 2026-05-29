'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNotification } from '@/contexts/NotificationContext';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, orderBy, limit, doc, getDoc } from 'firebase/firestore';
import { TimeRecord, Shift } from '@/types';
import { formatTimeToHHmm, roundToNearest5Minutes, getDistanceMetres, isSignificantOvertime } from '@/lib/geofence';
import { isWithinShopHours, SHOP_OPEN_TIME, SHOP_CLOSE_TIME, formatTimeTo12Hour } from '@/lib/utils';
import { clockIn, clockOut } from '@/app/actions/clock';
import StaffPageShell from '@/components/staff/StaffPageShell';
import StaffAlert from '@/components/staff/StaffAlert';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Modal from '@/components/ui/Modal';
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
    const { userData, activeRecord, todayShift, shopLocation } = useAuth();
    const { showNotification } = useNotification();

    const shop = shopLocation;
    const [geo, setGeo] = useState<GeoState | null>(null);
    const [geoError, setGeoError] = useState<string | null>('Waiting for location...');
    const [processing, setProcessing] = useState(false);
    const [clockInCoolingRemaining, setClockInCoolingRemaining] = useState<number>(0);
    const [clockOutCoolingRemaining, setClockOutCoolingRemaining] = useState<number>(0);
    const [shiftDurationSeconds, setShiftDurationSeconds] = useState(0);
    const [confirmModalData, setConfirmModalData] = useState<{
        action: 'clock-in' | 'clock-out';
        title: string;
        message: string;
        type: 'early' | 'late' | 'unscheduled' | 'offsite';
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
            } else {
                setShiftDurationSeconds(0);
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [activeRecord]);

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
    // 3. PROCESS CLOCK OUT (Manual or Auto-close)
    // ─────────────────────────────────────────────────────────
    const processClockOut = useCallback(async (
        record: TimeRecord, 
        shift: Shift | null, 
        isAutoClose: boolean
    ) => {
        if (!userData) return;

        try {
            const now = new Date();
            const result = await clockOut(
                record.id!,
                geo?.lat ?? 0,
                geo?.lng ?? 0,
                geo?.accuracy ?? 0,
                isAutoClose,
                now.getTime(),
                now.getTimezoneOffset()
            );

            if (result.success) {
                if (isAutoClose) {
                    showNotification('Your previous open shift was auto-closed.', 'error');
                } else {
                    const clockOutRounded = roundToNearest5Minutes(now);
                    showNotification(`Clocked out. Timesheet generated (${clockOutRounded}).`, 'success');
                    setClockInCoolingRemaining(10);
                }
            } else {
                showNotification(result.error || 'Failed to clock out.', 'error');
            }
        } catch (error: unknown) {
            console.error('Error clocking out:', error);
            const errMsg = error instanceof Error ? error.message : 'Failed to clock out.';
            showNotification(errMsg, 'error');
        }
    }, [userData, geo, showNotification]);

    // ─────────────────────────────────────────────────────────
    // 1. Reactive cooling period calculations and auto-close validations
    // ─────────────────────────────────────────────────────────
    useEffect(() => {
        if (!userData) return;

        if (!activeRecord) {
            // Fetch last completed record to check clock-in cooling lock (10 seconds)
            const checkCooling = async () => {
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
                        const remaining = 10 - elapsedSecs;
                        if (remaining > 0) {
                            setClockInCoolingRemaining(remaining);
                        } else {
                            setClockInCoolingRemaining(0);
                        }
                    }
                }
            };
            checkCooling();
            setClockOutCoolingRemaining(0);
        } else {
            // Calculate active clock-out cooling lock (10s since clock-in)
            const clockInMs = activeRecord.clockInTime.toMillis();
            const elapsedSecs = Math.floor((Date.now() - clockInMs) / 1000);
            const remaining = 10 - elapsedSecs;
            if (remaining > 0) {
                setClockOutCoolingRemaining(remaining);
            } else {
                setClockOutCoolingRemaining(0);
            }
            setClockInCoolingRemaining(0);

            // Verify if active shift needs to be auto-closed
            const checkAutoClose = async () => {
                let shift: Shift | null = null;
                if (activeRecord.shiftId) {
                    const shiftDoc = await getDoc(doc(db, 'shifts', activeRecord.shiftId));
                    if (shiftDoc.exists()) {
                        shift = { id: shiftDoc.id, ...shiftDoc.data() } as Shift;
                    }
                }
                if (shift) {
                    const shiftEnd = new Date(shift.date.toDate());
                    const [eh, em] = shift.endTime.split(':').map(Number);
                    shiftEnd.setHours(eh, em, 0, 0);
                    
                    const autoCloseTimeMs = shiftEnd.getTime() + 1 * 60 * 1000;
                    const nowMs = Date.now();

                    if (nowMs > autoCloseTimeMs) {
                        // Stale rostered shift — trigger auto close
                        await processClockOut(activeRecord, shift, true);
                    }
                }
            };
            checkAutoClose();
        }
    }, [activeRecord, userData, processClockOut]);

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

        return () => {
            if (watchIdRef.current !== null) {
                navigator.geolocation.clearWatch(watchIdRef.current);
            }
        };
    }, [shop]);



    // ─────────────────────────────────────────────────────────
    // 4. BUTTON HANDLERS
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
            const now = new Date();
            const roundedIn = roundToNearest5Minutes(now);
            const actualIn = formatTimeToHHmm(now);
            const roundingNote =
                roundedIn !== actualIn
                    ? ` Recorded time will be ${formatTimeTo12Hour(roundedIn)} (rounded to the nearest 5 minutes from ${formatTimeTo12Hour(actualIn)}).`
                    : ` Recorded time will be ${formatTimeTo12Hour(roundedIn)}.`;

            if (!todayShift) {
                setConfirmModalData({
                    action: 'clock-in',
                    title: 'Unscheduled Shift',
                    message: 'You are not rostered for a shift today. Clocking in will record this as an Emergency / Unscheduled shift and will require Admin approval.' + roundingNote,
                    type: 'unscheduled',
                });
                return;
            }

            // Check if this shift has already been completed today
            const completedQ = query(
                collection(db, 'timeRecords'),
                where('staffId', '==', userData.id),
                where('shiftId', '==', todayShift.id)
            );
            const completedSnap = await getDocs(completedQ);
            const hasCompleted = completedSnap.docs.some(doc => doc.data().clockOutTime !== null);
            if (hasCompleted) {
                setConfirmModalData({
                    action: 'clock-in',
                    title: 'Unscheduled Shift',
                    message: 'You have already completed your rostered shift for today. Clocking in again will record this as an Emergency / Unscheduled shift and will require Admin approval.' + roundingNote,
                    type: 'unscheduled',
                });
                return;
            }

            const [sh, sm] = todayShift.startTime.split(':').map(Number);
            const shiftStart = new Date(todayShift.date.toDate());
            shiftStart.setHours(sh, sm, 0, 0);
            const diffMins = Math.round((now.getTime() - shiftStart.getTime()) / (1000 * 60));

            if (diffMins < -5) {
                setConfirmModalData({
                    action: 'clock-in',
                    title: 'Starting Early',
                    message: `You are clocking in early. Your rostered shift starts at ${formatTimeTo12Hour(todayShift.startTime)} (in ${Math.abs(diffMins)} minutes). Do you want to proceed?${roundingNote}`,
                    type: 'early',
                });
                return;
            } else if (diffMins > 5) {
                setConfirmModalData({
                    action: 'clock-in',
                    title: 'Running Late',
                    message: `You are clocking in late. Your rostered shift was scheduled to start at ${formatTimeTo12Hour(todayShift.startTime)} (${diffMins} minutes ago). Do you want to proceed?${roundingNote}`,
                    type: 'late',
                });
                return;
            }
        }

        setConfirmModalData(null);
        setProcessing(true);
        try {
            const now = new Date();
            const clockInRounded = roundToNearest5Minutes(now);

            if (!isWithinShopHours(clockInRounded)) {
                showNotification(`Clock-in is only allowed between ${SHOP_OPEN_TIME} and ${SHOP_CLOSE_TIME}`, 'error');
                setProcessing(false);
                return;
            }

            const result = await clockIn(
                geo.lat,
                geo.lng,
                geo.accuracy,
                now.getTime(),
                now.getTimezoneOffset()
            );

            if (result.success) {
                showNotification('Clocked in successfully!', 'success');
                setClockOutCoolingRemaining(10); // 10 seconds safety clock-out lock
            } else {
                showNotification(result.error || 'Failed to clock in.', 'error');
            }
        } catch (error: unknown) {
            console.error('Error clocking in:', error);
            const errMsg = error instanceof Error ? error.message : 'Failed to clock in.';
            showNotification(errMsg, 'error');
        } finally {
            setProcessing(false);
        }
    };

    const handleClockOut = async (force: boolean = false) => {
        if (!userData || !activeRecord) return;
        if (clockOutCoolingRemaining > 0) {
            showNotification('Please wait before clocking out.', 'error');
            return;
        }

        // Fetch shift details once by ID (if associated with a rostered shift)
        let shift: Shift | null = null;
        if (activeRecord.shiftId) {
            const shiftDoc = await getDoc(doc(db, 'shifts', activeRecord.shiftId));
            if (shiftDoc.exists()) {
                shift = { id: shiftDoc.id, ...shiftDoc.data() } as Shift;
            }
        }

        if (!force) {
            const now = new Date();
            const roundedOut = roundToNearest5Minutes(now);
            const actualOut = formatTimeToHHmm(now);
            const roundingNote =
                roundedOut !== actualOut
                    ? ` Recorded time will be ${formatTimeTo12Hour(roundedOut)} (rounded to the nearest 5 minutes from ${formatTimeTo12Hour(actualOut)}).`
                    : ` Recorded time will be ${formatTimeTo12Hour(roundedOut)}.`;

            if (geo && shop && geo.distanceMetres !== null && !geo.withinRange) {
                setConfirmModalData({
                    action: 'clock-out',
                    title: 'Clocking Out Off-Site',
                    message:
                        `You are about ${geo.distanceMetres}m from the shop. Payroll may use rostered end times when clocking out away from site.${roundingNote}`,
                    type: 'offsite',
                });
                return;
            }

            if (!shift) {
                setConfirmModalData({
                    action: 'clock-out',
                    title: 'Unscheduled Clock-Out',
                    message:
                        'This session is not linked to a rostered shift. Your timesheet may need admin review.' +
                        roundingNote,
                    type: 'unscheduled',
                });
                return;
            }

            const [eh, em] = shift.endTime.split(':').map(Number);
            const shiftEnd = new Date(shift.date.toDate());
            shiftEnd.setHours(eh, em, 0, 0);
            const diffMins = Math.round((now.getTime() - shiftEnd.getTime()) / (1000 * 60));

            if (diffMins < -5) {
                setConfirmModalData({
                    action: 'clock-out',
                    title: 'Clocking Out Early',
                    message: `Your rostered shift ends at ${shift.endTime} (in ${Math.abs(diffMins)} minutes). Do you want to clock out now?${roundingNote}`,
                    type: 'early',
                });
                return;
            }

            if (diffMins > 5) {
                const overtimeNote = isSignificantOvertime(roundedOut, shift.endTime)
                    ? ' This may be flagged as significant overtime for admin review.'
                    : '';
                setConfirmModalData({
                    action: 'clock-out',
                    title: 'Clocking Out Late',
                    message: `Your rostered shift ended at ${shift.endTime} (${diffMins} minutes ago).${overtimeNote}${roundingNote}`,
                    type: 'late',
                });
                return;
            }
        }

        setConfirmModalData(null);
        setProcessing(true);
        try {
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

    return (
        <StaffPageShell title="Time Clock" maxWidth="md" centered headerCentered>
            <Card className="w-full p-6 sm:p-8 space-y-6">
                {gpsAlert()}

                {activeRecord ? (
                    <div className="text-center space-y-6">
                        <div className="p-6 border border-blue-200 bg-blue-50/50 rounded-xl animate-session-pulse">
                            <p className="text-label text-blue-800 mb-1">Active session</p>
                            <p className="text-stat">{formatDuration(shiftDurationSeconds)}</p>
                            <div className="flex justify-center items-center gap-1.5 mt-2 text-xs text-blue-700 font-medium">
                                <span className="inline-block w-1.5 h-1.5 bg-blue-600 rounded-full motion-reduce:animate-none animate-ping" />
                                <span>
                                    Started at{' '}
                                    {formatTimeTo12Hour(formatTimeToHHmm(activeRecord.clockInTime.toDate()))}
                                </span>
                            </div>
                            <p className="text-label mt-1">Rounded in: {formatTimeTo12Hour(activeRecord.clockInRounded)}</p>
                        </div>

                        <Button
                            variant="danger"
                            size="lg"
                            fullWidth
                            onClick={() => handleClockOut(false)}
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
                                Please wait {clockInCoolingRemaining}s before clocking in again.
                            </StaffAlert>
                        )}
                        {(!geo || geo.accuracy <= 150) && clockInCoolingRemaining === 0 && (
                            <div className="py-8 px-4 bg-gray-50 border border-dashed border-gray-200 rounded-xl">
                                <p className="text-sm text-gray-600 font-medium">Ready to start your shift</p>
                                {todayShift && (
                                    <p className="text-label mt-2">
                                    Rostered: {formatTimeTo12Hour(todayShift.startTime)} – {formatTimeTo12Hour(todayShift.endTime)}
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
                            icon={
                                confirmModalData?.type === 'offsite'
                                    ? MapPinOff
                                    : confirmModalData?.type === 'late' ||
                                        confirmModalData?.type === 'early'
                                      ? Clock
                                      : AlertTriangle
                            }
                            size="lg"
                            className="text-amber-600"
                        />
                    </div>
                }
                secondaryAction={{ label: 'Cancel', onClick: () => setConfirmModalData(null) }}
                primaryAction={{
                    label: 'Proceed',
                    onClick: () => {
                        if (confirmModalData?.action === 'clock-out') {
                            handleClockOut(true);
                        } else {
                            handleClockIn(true);
                        }
                    },
                }}
            />
        </StaffPageShell>
    );
}
