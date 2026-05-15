'use client';

import { useState, useEffect, useRef } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { useNotification } from '@/contexts/NotificationContext';
import { db } from '@/lib/firebase';
import { collection, addDoc, query, where, getDocs, updateDoc, doc, Timestamp, getDoc } from 'firebase/firestore';
import { TimeRecord, Timesheet, Shift, ShopLocation, TimesheetSource } from '@/types';
import { useRouter } from 'next/navigation';
import { getShopLocation, checkGeofence, roundToNearest5, getDistanceMetres, isOvertime } from '@/lib/geofence';
import { getWeekStart } from '@/lib/utils';
import Logo from '@/components/Logo';

interface GeoState {
    lat: number;
    lng: number;
    accuracy: number;
    distanceMetres: number | null;
    withinRange: boolean | null;
}

export default function ClockInOutPage() {
    const { userData } = useAuth();
    const router = useRouter();
    const { showNotification } = useNotification();

    const [activeRecord, setActiveRecord] = useState<TimeRecord | null>(null);
    const [shop, setShop] = useState<ShopLocation | null>(null);
    const [geo, setGeo] = useState<GeoState | null>(null);
    const [geoError, setGeoError] = useState<string | null>('Waiting for location...');
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);

    const watchIdRef = useRef<number | null>(null);

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

    // ─────────────────────────────────────────────────────────
    // 3. AUTO-CLOSE LOGIC & FETCH OPEN RECORD
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
        
        // Just return the first shift of that day for now
        return { id: snap.docs[0].id, ...snap.docs[0].data() } as Shift;
    };

    const checkActiveClockIn = async () => {
        if (!userData) return;

        const q = query(
            collection(db, 'timeRecords'),
            where('staffId', '==', userData.id),
            where('clockOutTime', '==', null)
        );

        const snapshot = await getDocs(q);
        if (snapshot.empty) {
            setActiveRecord(null);
            return;
        }

        const docSnap = snapshot.docs[0];
        const record = { id: docSnap.id, ...docSnap.data() } as TimeRecord;
        
        // CHECK AUTO-CLOSE
        const shift = await getMatchingShift(record.clockInTime.toMillis());
        if (shift) {
            const shiftEnd = new Date(shift.date.toDate());
            const [eh, em] = shift.endTime.split(':').map(Number);
            shiftEnd.setHours(eh, em, 0, 0);
            
            // Auto close time = shift end + 30 mins
            const autoCloseTimeMs = shiftEnd.getTime() + 30 * 60 * 1000;
            const nowMs = Date.now();

            if (nowMs > autoCloseTimeMs) {
                // IT'S STALE — AUTO CLOSE IT
                await processClockOut(record, shift, true);
                return;
            }
        }

        setActiveRecord(record);
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
        const clockOutRounded = isAutoClose && shift ? shift.endTime : roundToNearest5(now);
        
        const clockInDate = record.clockInTime.toDate();
        const [ih, im] = record.clockInRounded.split(':').map(Number);
        clockInDate.setHours(ih, im, 0, 0);

        const clockOutDate = isAutoClose ? new Date(clockInDate) : new Date();
        const [oh, om] = clockOutRounded.split(':').map(Number);
        clockOutDate.setHours(oh, om, 0, 0);

        const hoursWorked = (clockOutDate.getTime() - clockInDate.getTime()) / (1000 * 60 * 60);

        let source: TimesheetSource = 'GPS_UNMATCHED';
        let requiresNote = false;

        if (isAutoClose) {
            source = 'AUTO_CLOSED';
            requiresNote = true;
        } else if (shift) {
            if (geo && shop && geo.distanceMetres !== null && geo.distanceMetres > shop.radiusMetres) {
                source = 'GPS_OUTSIDE';
                requiresNote = true;
            } else if (isOvertime(clockOutRounded, shift.endTime)) {
                source = 'GPS_OVERTIME';
                requiresNote = true;
            } else {
                source = 'GPS_VERIFIED';
            }
        }

        // Calculate workedEnd: if GPS_OUTSIDE, clamp it to shift.endTime
        let finalWorkedEnd = clockOutRounded;
        if (source === 'GPS_OUTSIDE' && shift) {
            finalWorkedEnd = shift.endTime; // no extra pay if off-site
        }

        // 1. Update TimeRecord
        const recordRef = doc(db, 'timeRecords', record.id!);
        await updateDoc(recordRef, {
            clockOutTime: isAutoClose ? Timestamp.fromDate(clockOutDate) : Timestamp.now(),
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

        // 2. Auto-generate Timesheet
        const timesheetPayload: Omit<Timesheet, 'id'> = {
            staffId: userData.id,
            shiftId: shift ? shift.id! : null,
            date: Timestamp.fromDate(clockInDate),
            weekStartDate: Timestamp.fromDate(getWeekStart(clockInDate)),
            approvedShiftStart: shift ? shift.startTime : '',
            approvedShiftEnd: shift ? shift.endTime : '',
            workedStart: record.clockInRounded,
            workedEnd: finalWorkedEnd,
            status: 'PENDING',
            source,
            timeRecordId: record.id!,
            clockInLat: record.clockInLat,
            clockInLng: record.clockInLng,
            clockOutLat: geo?.lat ?? undefined,
            clockOutLng: geo?.lng ?? undefined,
            clockOutDistanceMetres: geo?.distanceMetres ?? undefined,
            requiresAdminNote: requiresNote,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
        };

        const tsRef = await addDoc(collection(db, 'timesheets'), timesheetPayload);
        await updateDoc(recordRef, { timesheetId: tsRef.id });

        if (isAutoClose) {
            showNotification('Your previous open shift was auto-closed.', 'error');
            setActiveRecord(null);
        } else {
            showNotification(`Clocked out. Timesheet generated (${finalWorkedEnd}).`, 'success');
            setActiveRecord(null);
        }
    };

    // ─────────────────────────────────────────────────────────
    // 5. BUTTON HANDLERS
    // ─────────────────────────────────────────────────────────
    const handleClockIn = async () => {
        if (!userData || !geo || !geo.withinRange) return;

        setProcessing(true);
        try {
            const now = new Date();
            const payload: Omit<TimeRecord, 'id'> = {
                staffId: userData.id,
                clockInTime: Timestamp.now(),
                clockInRounded: roundToNearest5(now),
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
                shiftId: null,
                timesheetId: null,
                source: 'GPS',
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
            };

            await addDoc(collection(db, 'timeRecords'), payload);
            showNotification('Clocked in successfully!', 'success');
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
    if (loading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <ProtectedRoute requiredRole="STAFF">
            <div className="min-h-screen bg-background flex flex-col">
                <header className="bg-white border-b border-gray-200">
                    <div className="max-w-md mx-auto px-4 py-4 flex items-center justify-between">
                        <Logo width={90} height={30} />
                        <button
                            onClick={() => router.push('/dashboard')}
                            className="text-sm font-semibold text-gray-500 hover:text-gray-900"
                        >
                            Close
                        </button>
                    </div>
                </header>

                <main className="flex-1 flex flex-col items-center justify-center p-4">
                    <div className="w-full max-w-md card-base p-8 relative overflow-hidden">
                        
                        <div className="text-center mb-8">
                            <h1 className="text-2xl font-black text-gray-900 tracking-tight uppercase">Time Clock</h1>
                            <p className="text-sm text-gray-500 mt-1 font-medium">{userData?.name}</p>
                        </div>

                        {/* GPS STATUS CARD */}
                        <div className={`mb-8 p-4 rounded-xl border ${
                            geoError ? 'bg-red-50 border-red-200' :
                            !geo ? 'bg-amber-50 border-amber-200' :
                            geo.withinRange ? 'bg-green-50 border-green-200' :
                            'bg-orange-50 border-orange-200'
                        }`}>
                            <div className="flex items-start gap-3">
                                <span className="text-xl">
                                    {geoError ? '🚫' : !geo ? '⏳' : geo.withinRange ? '📍' : '🚶'}
                                </span>
                                <div>
                                    <p className={`text-xs font-black uppercase tracking-widest ${
                                        geoError ? 'text-red-700' :
                                        !geo ? 'text-amber-700' :
                                        geo.withinRange ? 'text-green-700' :
                                        'text-orange-700'
                                    }`}>
                                        {geoError ? 'GPS Error' : !geo ? 'Locating...' : geo.withinRange ? 'In Range' : 'Out of Range'}
                                    </p>
                                    <p className={`text-sm mt-1 ${
                                        geoError ? 'text-red-600' :
                                        !geo ? 'text-amber-600' :
                                        geo.withinRange ? 'text-green-800 font-semibold' :
                                        'text-orange-800 font-semibold'
                                    }`}>
                                        {geoError || (geo && shop ? `${geo.distanceMetres}m from shop` : 'Acquiring GPS signal...')}
                                    </p>
                                    {geo && geo.accuracy > 50 && (
                                        <p className="text-[10px] text-amber-600 font-bold mt-1">⚠️ Poor accuracy ({Math.round(geo.accuracy)}m)</p>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* MAIN CLOCK ACTION */}
                        {activeRecord ? (
                            <div className="text-center">
                                <div className="mb-8 p-6 border-2 border-blue-100 bg-blue-50/30 rounded-2xl">
                                    <p className="text-xs font-bold text-blue-600 uppercase tracking-widest mb-2">Active Session</p>
                                    <p className="text-4xl font-black text-gray-900 tabular-nums">
                                        {activeRecord.clockInRounded}
                                    </p>
                                    <p className="text-xs text-gray-500 mt-2 font-medium">
                                        Started at {activeRecord.clockInTime.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                </div>

                                <button
                                    onClick={handleClockOut}
                                    disabled={processing}
                                    className="w-full py-4 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white text-base font-black uppercase tracking-widest rounded-xl transition-all shadow-sm hover:shadow-md active:scale-[0.99]"
                                >
                                    {processing ? 'Processing...' : 'Clock Out'}
                                </button>
                                {geo && !geo.withinRange && (
                                    <p className="text-[10px] text-orange-600 font-bold mt-3 text-center">
                                        ⚠️ You are clocking out off-site. Rostered end time will apply.
                                    </p>
                                )}
                            </div>
                        ) : (
                            <div className="text-center">
                                <div className="mb-8 p-10 bg-gray-50 border border-gray-200 rounded-2xl border-dashed">
                                    <p className="text-sm text-gray-400 font-semibold">Ready to start your shift</p>
                                </div>

                                <button
                                    onClick={handleClockIn}
                                    disabled={processing || !geo?.withinRange || !!geoError}
                                    className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white text-base font-black uppercase tracking-widest rounded-xl transition-all shadow-sm hover:shadow-md active:scale-[0.99] disabled:cursor-not-allowed"
                                >
                                    {processing ? 'Processing...' : 'Clock In'}
                                </button>
                            </div>
                        )}
                        
                    </div>
                </main>
            </div>
        </ProtectedRoute>
    );
}
