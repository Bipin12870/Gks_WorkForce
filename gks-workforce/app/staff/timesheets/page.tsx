'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, Timestamp, addDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { Shift, Timesheet, TimesheetStatus, TimeRecord } from '@/types';
import { getWeekStart, getDayName, formatDate, isWithinShopHours, SHOP_OPEN_TIME, SHOP_CLOSE_TIME, calculateHours } from '@/lib/utils';
import { useNotification } from '@/contexts/NotificationContext';
import { isSignificantOvertime } from '@/lib/geofence';
import StaffPageShell from '@/components/staff/StaffPageShell';
import StaffWeekPicker from '@/components/staff/StaffWeekPicker';
import StaffListRow from '@/components/staff/StaffListRow';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Card from '@/components/ui/Card';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import Icon from '@/components/ui/Icon';
import {
    AlertTriangle,
    Clock,
    FileText,
    MapPin,
    PenLine,
} from 'lucide-react';

export default function StaffTimesheetsPage() {
    const { userData } = useAuth();
    const { showNotification } = useNotification();
    const [selectedWeek, setSelectedWeek] = useState<Date>(getWeekStart(new Date()));
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
    const [activeRecord, setActiveRecord] = useState<TimeRecord | null>(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState<string | null>(null);

    // Form state for editing worked times manually (fallback)
    const [editMode, setEditMode] = useState<string | null>(null);
    const [workedStart, setWorkedStart] = useState('');
    const [workedEnd, setWorkedEnd] = useState('');

    useEffect(() => {
        if (!userData || userData.role !== 'STAFF') return;

        const weekStart = new Date(selectedWeek);
        const weekEnd = new Date(selectedWeek);
        weekEnd.setDate(weekEnd.getDate() + 7);

        // Listen for approved shifts
        const shiftsQuery = query(
            collection(db, 'shifts'),
            where('staffId', '==', userData.id),
            where('status', '==', 'APPROVED'),
            where('date', '>=', Timestamp.fromDate(weekStart)),
            where('date', '<', Timestamp.fromDate(weekEnd))
        );

        const unsubscribeShifts = onSnapshot(shiftsQuery,
            (snapshot) => {
                const loadedShifts: Shift[] = [];
                snapshot.forEach((doc) => {
                    loadedShifts.push({ id: doc.id, ...doc.data() } as Shift);
                });
                // Sort by date and startTime
                loadedShifts.sort((a, b) => {
                    const dateDiff = a.date.toMillis() - b.date.toMillis();
                    if (dateDiff !== 0) return dateDiff;
                    return a.startTime.localeCompare(b.startTime);
                });
                setShifts(loadedShifts);
            },
            (error) => {
                console.error('Error fetching shifts:', error);
                showNotification('Failed to load rostered shifts.', 'error');
            }
        );

        // Listen for timesheets
        const timesheetsQuery = query(
            collection(db, 'timesheets'),
            where('staffId', '==', userData.id),
            where('weekStartDate', '==', Timestamp.fromDate(weekStart))
        );

        const unsubscribeTimesheets = onSnapshot(timesheetsQuery,
            (snapshot) => {
                const loadedTimesheets: Timesheet[] = [];
                snapshot.forEach((doc) => {
                    loadedTimesheets.push({ id: doc.id, ...doc.data() } as Timesheet);
                });
                setTimesheets(loadedTimesheets);
                setLoading(false);
            },
            (error) => {
                console.error('Error fetching timesheets:', error);
                showNotification('Failed to load timesheets.', 'error');
                setLoading(false);
            }
        );

        // Listen for active clock sessions
        const activeRecordQuery = query(
            collection(db, 'timeRecords'),
            where('staffId', '==', userData.id),
            where('clockOutTime', '==', null)
        );

        const unsubscribeActiveRecord = onSnapshot(activeRecordQuery,
            (snapshot) => {
                if (!snapshot.empty) {
                    const docSnap = snapshot.docs[0];
                    setActiveRecord({ id: docSnap.id, ...docSnap.data() } as TimeRecord);
                } else {
                    setActiveRecord(null);
                }
            },
            (error) => {
                console.error('Error fetching active record:', error);
            }
        );

        return () => {
            unsubscribeShifts();
            unsubscribeTimesheets();
            unsubscribeActiveRecord();
        };
    }, [selectedWeek, userData]);

    const changeWeek = (direction: 'prev' | 'next') => {
        const newWeek = new Date(selectedWeek);
        newWeek.setDate(newWeek.getDate() + (direction === 'next' ? 7 : -7));
        setSelectedWeek(getWeekStart(newWeek));
    };

    const getTimesheetForShift = (shiftId: string) => {
        return timesheets.find(ts => ts.shiftId === shiftId);
    };

    const isFutureShift = (shift: Shift) => {
        const shiftDate = shift.date.toDate();
        const [endHours, endMinutes] = shift.endTime.split(':').map(Number);
        
        const shiftEnd = new Date(shiftDate);
        shiftEnd.setHours(endHours, endMinutes, 0, 0);

        // Handle overnight shifts (e.g. 22:00 to 06:00)
        const [startHours, startMinutes] = shift.startTime.split(':').map(Number);
        if (endHours < startHours || (endHours === startHours && endMinutes < startMinutes)) {
            shiftEnd.setDate(shiftEnd.getDate() + 1);
        }

        return new Date() < shiftEnd;
    };

    const handleStartEdit = (shift: Shift) => {
        if (activeRecord) {
            showNotification('You have an active clock session. Please clock out first.', 'error');
            return;
        }

        if (isFutureShift(shift)) {
            showNotification('You cannot submit timesheets for future shifts.', 'error');
            return;
        }

        const existingTs = getTimesheetForShift(shift.id!);
        if (existingTs) return; // Cannot edit if already exists

        setEditMode(shift.id!);
        setWorkedStart(shift.startTime);
        setWorkedEnd(shift.endTime);
    };

    const handleSubmitManualTimesheet = async (shift: Shift) => {
        if (!userData) return;

        setSubmitting(shift.id!);
        try {
            // Check if timesheet already exists to prevent duplicate submissions
            const q = query(
                collection(db, 'timesheets'),
                where('staffId', '==', userData.id),
                where('shiftId', '==', shift.id!)
            );
            const existingSnap = await getDocs(q);
            // Strictly enforce shop hours (09:00-23:59)
            if (!isWithinShopHours(workedStart) || !isWithinShopHours(workedEnd)) {
                showNotification(`Times must be between ${SHOP_OPEN_TIME} and ${SHOP_CLOSE_TIME}`, 'error');
                return;
            }

            // Standardize duration check (reject end <= start)
            if (calculateHours(workedStart, workedEnd) <= 0) {
                showNotification('Invalid duration. Worked end must be after start time.', 'error');
                return;
            }

            if (!existingSnap.empty) {
                showNotification('A timesheet for this shift has already been submitted.', 'error');
                setEditMode(null);
                return;
            }

            const requiresNote = isSignificantOvertime(workedEnd, shift.endTime);

            const timesheetData: Omit<Timesheet, 'id'> = {
                staffId: userData.id,
                shiftId: shift.id!,
                date: shift.date,
                weekStartDate: Timestamp.fromDate(getWeekStart(shift.date.toDate())),
                approvedShiftStart: shift.startTime,
                approvedShiftEnd: shift.endTime,
                workedStart: workedStart,
                workedEnd: workedEnd,
                status: 'PENDING',
                source: 'MANUAL',
                requiresAdminNote: requiresNote,
                createdAt: serverTimestamp() as Timestamp,
                updatedAt: serverTimestamp() as Timestamp
            };

            await addDoc(collection(db, 'timesheets'), timesheetData);
            showNotification('Manual timesheet submitted successfully', 'success');
            setEditMode(null);
        } catch (error) {
            console.error('Error submitting timesheet:', error);
            showNotification('Failed to submit timesheet', 'error');
        } finally {
            setSubmitting(null);
        }
    };

    const getStatusBadge = (status: TimesheetStatus) => {
        switch (status) {
            case 'PENDING':
                return <Badge variant="warning">Pending</Badge>;
            case 'APPROVED':
                return <Badge variant="success">Approved</Badge>;
            case 'REJECTED':
                return <Badge variant="danger">Rejected</Badge>;
            default:
                return null;
        }
    };

    const getSourceBadge = (source: string) => {
        if (source === 'MANUAL') {
            return (
                <Badge variant="neutral">
                    <Icon icon={PenLine} size="sm" className="text-gray-500" /> Manual
                </Badge>
            );
        }
        if (source === 'AUTO_CLOSED') {
            return (
                <Badge variant="warning">
                    <Icon icon={Clock} size="sm" /> Auto-closed
                </Badge>
            );
        }
        if (source === 'GPS_OUTSIDE') {
            return (
                <Badge variant="danger">
                    <Icon icon={AlertTriangle} size="sm" /> Outside geofence
                </Badge>
            );
        }
        return (
            <Badge variant="info">
                <Icon icon={MapPin} size="sm" /> GPS verified
            </Badge>
        );
    };


    // Unified list for display
    const unifiedDisplayList = useMemo(() => {
        // 1. Start with all shifts
        const list: Array<{
            id: string;
            date: Timestamp;
            shift: Shift | null;
            timesheet: Timesheet | undefined;
            type: string;
        }> = shifts.map(shift => {
            const ts = timesheets.find(t => t.shiftId === shift.id);
            return {
                id: shift.id || `shift-${Math.random()}`,
                date: shift.date,
                shift,
                timesheet: ts,
                type: 'ROSTERED'
            };
        });

        // 2. Add unrostered timesheets
        timesheets.forEach(ts => {
            const hasShiftInCurrentList = shifts.some(s => s.id === ts.shiftId);
            if (!ts.shiftId || !hasShiftInCurrentList) {
                list.push({
                    id: ts.id || `ts-${Math.random()}`,
                    date: ts.date,
                    shift: null,
                    timesheet: ts,
                    type: 'UNROSTERED'
                });
            }
        });

        // 3. Sort by date (descending)
        return list.sort((a, b) => b.date.toMillis() - a.date.toMillis());
    }, [shifts, timesheets]);

    return (
        <StaffPageShell title="Timesheets" description="Submit and track your worked hours">
            <Card className="mb-6">
                <StaffWeekPicker
                    weekStart={selectedWeek}
                    onPrev={() => changeWeek('prev')}
                    onNext={() => changeWeek('next')}
                />
            </Card>

            {loading ? (
                <Spinner className="py-16" />
            ) : unifiedDisplayList.length === 0 ? (
                <Card>
                    <EmptyState
                        icon={FileText}
                        title="No activity this week"
                        description="Rostered shifts and submitted timesheets will show here."
                    />
                </Card>
            ) : (
                <div className="space-y-3">
                    {unifiedDisplayList.map((item) => {
                        const shift = item.shift;
                        const timesheet = item.timesheet;
                        const isEditing = editMode === item.id;
                        const isSubmitting = submitting === item.id;

                        const banner =
                            timesheet && timesheet.source !== 'MANUAL' ? (
                                <div className="bg-blue-50/80 border-b border-blue-100 px-4 py-2 flex items-center justify-between gap-2">
                                    {getSourceBadge(timesheet.source)}
                                    <span className="text-label">From time clock</span>
                                </div>
                            ) : undefined;

                        const actions = timesheet ? (
                            <div className="flex flex-col items-end gap-2">
                                <p className="text-section-title">
                                    {timesheet.workedStart} – {timesheet.workedEnd}
                                </p>
                                <div className="flex flex-wrap gap-2 justify-end">
                                    {timesheet.source === 'MANUAL' && getSourceBadge('MANUAL')}
                                    {getStatusBadge(timesheet.status)}
                                </div>
                            </div>
                        ) : isEditing && shift ? (
                            <div className="w-full space-y-3">
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-label block mb-1">Start</label>
                                        <Input
                                            type="time"
                                            value={workedStart}
                                            onChange={(e) => setWorkedStart(e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-label block mb-1">End</label>
                                        <Input
                                            type="time"
                                            value={workedEnd}
                                            onChange={(e) => setWorkedEnd(e.target.value)}
                                        />
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        variant="primary"
                                        className="flex-1"
                                        onClick={() => handleSubmitManualTimesheet(shift)}
                                        disabled={isSubmitting}
                                    >
                                        {isSubmitting ? 'Saving...' : 'Submit'}
                                    </Button>
                                    <Button variant="secondary" onClick={() => setEditMode(null)}>
                                        Cancel
                                    </Button>
                                </div>
                            </div>
                        ) : shift && isFutureShift(shift) ? (
                            <div className="text-right">
                                <Badge variant="neutral">Future shift</Badge>
                                <p className="text-label mt-1">Available after shift ends</p>
                            </div>
                        ) : shift ? (
                            activeRecord ? (
                                <div className="text-right">
                                    <Badge variant="warning">Clock active</Badge>
                                    <p className="text-label mt-1">Clock out to submit manually</p>
                                </div>
                            ) : (
                                <Button variant="secondary" onClick={() => handleStartEdit(shift)}>
                                    Submit manual timesheet
                                </Button>
                            )
                        ) : null;

                        return (
                            <StaffListRow
                                key={item.id}
                                icon={Clock}
                                iconClassName={
                                    timesheet && timesheet.source !== 'MANUAL' ? 'text-blue-600' : 'text-gray-400'
                                }
                                banner={banner}
                                title={
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-section-title">{formatDate(item.date.toDate())}</span>
                                        {item.type === 'UNROSTERED' && <Badge variant="warning">Unrostered</Badge>}
                                    </div>
                                }
                                subtitle={
                                    <p className="text-label">
                                        {getDayName(item.date.toDate().getDay())}
                                        {shift
                                            ? ` · ${shift.startTime} – ${shift.endTime}`
                                            : ' · Extra work'}
                                    </p>
                                }
                                trailing={actions}
                            />
                        );
                    })}
                </div>
            )}
        </StaffPageShell>
    );
}
