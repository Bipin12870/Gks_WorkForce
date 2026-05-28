'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';
import { Shift, Timesheet, TimesheetStatus, TimeRecord } from '@/types';
import { getWeekStart, getDayName, formatDate, calculateHours } from '@/lib/utils';
import { useNotification } from '@/contexts/NotificationContext';
import { createManualTimesheet } from '@/app/actions/timesheets';
import StaffSubpageShell from '@/components/staff/StaffSubpageShell';
import StaffWeekPicker from '@/components/staff/StaffWeekPicker';
import { TimesheetStatusBadge, TimesheetSourceBadge } from '@/components/admin/adminTimesheetBadges';
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
    ChevronDown,
} from 'lucide-react';

export default function StaffProfileTimesheetsPage() {
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

    const [expandedItems, setExpandedItems] = useState<Set<string>>(() => new Set());
    const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'UNSUBMITTED'>('ALL');

    const toggleItem = (id: string) => {
        setExpandedItems((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

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
            const result = await createManualTimesheet(shift.id!, workedStart, workedEnd);
            if (result.success) {
                showNotification('Manual timesheet submitted successfully', 'success');
                setEditMode(null);
            }
        } catch (error) {
            console.error('Error submitting timesheet:', error);
            showNotification((error as Error).message || 'Failed to submit timesheet', 'error');
        } finally {
            setSubmitting(null);
        }
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

    const filteredDisplayList = useMemo(() => {
        return unifiedDisplayList.filter(item => {
            if (statusFilter === 'ALL') return true;
            if (statusFilter === 'UNSUBMITTED') {
                return !item.timesheet && item.shift && !isFutureShift(item.shift);
            }
            return item.timesheet?.status === statusFilter;
        });
    }, [unifiedDisplayList, statusFilter]);

    return (
        <StaffSubpageShell title="Timesheets">
            <div className="flex justify-center mb-5 shrink-0">
                <div className="w-full max-w-xs">
                    <StaffWeekPicker
                        weekStart={selectedWeek}
                        onPrev={() => changeWeek('prev')}
                        onNext={() => changeWeek('next')}
                    />
                </div>
            </div>

            {/* Filter Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-2.5 mb-4 shrink-0 no-scrollbar select-none">
                {(['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'UNSUBMITTED'] as const).map((filter) => {
                    const isActive = statusFilter === filter;
                    const label = filter === 'ALL' ? 'All' : filter === 'UNSUBMITTED' ? 'Unsubmitted' : filter.charAt(0) + filter.slice(1).toLowerCase();
                    return (
                        <button
                            key={filter}
                            type="button"
                            onClick={() => setStatusFilter(filter)}
                            className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border cursor-pointer ${
                                isActive
                                    ? 'bg-slate-900 border-slate-900 text-white'
                                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:border-slate-300'
                            }`}
                        >
                            {label}
                        </button>
                    );
                })}
            </div>

            {loading ? (
                <div className="flex-1 flex items-center justify-center">
                    <Spinner />
                </div>
            ) : filteredDisplayList.length === 0 ? (
                <div className="shrink-0">
                    <Card>
                        <EmptyState
                            icon={FileText}
                            title="No matching timesheets"
                            description="Adjust your filter or select another week."
                        />
                    </Card>
                </div>
            ) : (
                <div className="flex-1 overflow-y-auto pr-0.5 pb-4">
                    <div className="space-y-3">
                    {filteredDisplayList.map((item) => {
                        const shift = item.shift;
                        const timesheet = item.timesheet;
                        const isEditing = editMode === item.id;
                        const isSubmitting = submitting === item.id;

                        if (isEditing && shift) {
                            return (
                                <Card key={item.id} className="p-4 sm:p-5 space-y-4">
                                    <div>
                                        <span className="text-section-title">{formatDate(item.date.toDate())}</span>
                                        <p className="text-label mt-1">
                                            {getDayName(item.date.toDate().getDay())} · Roster: {shift.startTime} – {shift.endTime}
                                        </p>
                                    </div>
                                    <div className="space-y-3">
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="text-label block mb-1">Start Time</label>
                                                <Input
                                                    type="time"
                                                    value={workedStart}
                                                    onChange={(e) => setWorkedStart(e.target.value)}
                                                />
                                            </div>
                                            <div>
                                                <label className="text-label block mb-1">End Time</label>
                                                <Input
                                                    type="time"
                                                    value={workedEnd}
                                                    onChange={(e) => setWorkedEnd(e.target.value)}
                                                />
                                            </div>
                                        </div>
                                        <div className="flex gap-2 pt-1">
                                            <Button
                                                variant="primary"
                                                className="flex-1 text-xs"
                                                onClick={() => handleSubmitManualTimesheet(shift)}
                                                disabled={isSubmitting}
                                            >
                                                {isSubmitting ? 'Saving...' : 'Submit'}
                                            </Button>
                                            <Button variant="secondary" className="text-xs" onClick={() => setEditMode(null)}>
                                                Cancel
                                            </Button>
                                        </div>
                                    </div>
                                </Card>
                            );
                        }

                        const workedDuration = timesheet ? calculateHours(timesheet.workedStart, timesheet.workedEnd) : 0;
                        const isExpanded = expandedItems.has(item.id);
                        const dateObj = item.date.toDate();
                        const formattedLongDate = dateObj.toLocaleDateString('en-US', {
                            weekday: 'long',
                            month: 'short',
                            day: 'numeric'
                        });

                        return (
                            <div
                                key={item.id}
                                className={`transition-all duration-200 border rounded-xl p-4 sm:p-5 border-slate-200 bg-white ${
                                    timesheet ? 'cursor-pointer hover:border-slate-300 hover:shadow-xs active:bg-slate-50/60' : ''
                                }`}
                                onClick={() => {
                                    if (timesheet) {
                                        toggleItem(item.id);
                                    }
                                }}
                            >
                                {/* Top row of card */}
                                <div className="flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <Clock size={15} className={`shrink-0 ${timesheet && timesheet.status === 'APPROVED' ? 'text-emerald-500' : 'text-slate-400'}`} />
                                        <span className="font-semibold text-slate-800 text-sm sm:text-base truncate">
                                            {formattedLongDate}
                                            {item.type === 'UNROSTERED' && (
                                                <Badge variant="warning" className="ml-1.5 text-[9px] px-1.5 py-0">Unrostered</Badge>
                                            )}
                                        </span>
                                    </div>
                                    <div className="shrink-0 text-right">
                                        {timesheet ? (
                                            <span className="font-semibold text-slate-800 text-sm sm:text-base tabular-nums">
                                                {workedDuration.toFixed(2)} hrs
                                            </span>
                                        ) : shift && isFutureShift(shift) ? (
                                            <span className="text-xs text-slate-400 font-medium">Future shift</span>
                                        ) : (
                                            <span className="text-xs text-amber-600 font-medium">Not submitted</span>
                                        )}
                                    </div>
                                </div>

                                {/* Bottom row of card */}
                                <div className="flex items-center justify-between gap-4 mt-1.5 pl-[23px]">
                                    <span className="text-xs sm:text-sm text-slate-500 font-medium">
                                        {shift ? `Roster: ${shift.startTime} – ${shift.endTime}` : timesheet ? `Clocked: ${timesheet.workedStart} – ${timesheet.workedEnd}` : ''}
                                    </span>
                                    <div className="shrink-0 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                        {timesheet ? (
                                            <TimesheetStatusBadge status={timesheet.status} />
                                        ) : shift && isFutureShift(shift) ? (
                                            <Badge variant="neutral" className="text-[10px] font-medium tracking-tight rounded-full px-2.5 py-0.5 border border-current/10">Future</Badge>
                                        ) : shift ? (
                                            activeRecord ? (
                                                <Badge variant="warning" className="text-[10px] font-medium tracking-tight rounded-full px-2.5 py-0.5 border border-current/10">Clock active</Badge>
                                            ) : (
                                                <Button
                                                    variant="secondary"
                                                    size="sm"
                                                    className="text-[11px] font-semibold tracking-tight rounded-full px-3 py-1 border border-slate-200 hover:bg-slate-50 cursor-pointer h-7"
                                                    onClick={() => handleStartEdit(shift)}
                                                >
                                                    Submit manual
                                                </Button>
                                            )
                                        ) : null}
                                    </div>
                                </div>

                                {/* Detailed accordion contents */}
                                {timesheet && isExpanded && (
                                    <div className="mt-4 pt-4 border-t border-slate-100 animate-in fade-in slide-in-from-top-2 duration-200 pl-[23px]">
                                        <div className={`border-l-2 ${
                                            timesheet.status === 'APPROVED' ? 'border-emerald-500' :
                                            timesheet.status === 'REJECTED' ? 'border-rose-500' :
                                            'border-amber-400'
                                        } pl-4 space-y-4`}>
                                            <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Roster</span>
                                                    <span className="text-xs font-semibold text-slate-700">
                                                        {shift ? `${shift.startTime} – ${shift.endTime}` : 'Unscheduled'}
                                                    </span>
                                                    {shift && (
                                                        <span className="text-[10px] text-slate-400 font-medium">
                                                            {calculateHours(shift.startTime, shift.endTime).toFixed(2)}h expected
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="flex flex-col gap-0.5">
                                                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Clocked</span>
                                                    <span className="text-xs font-semibold text-slate-700">
                                                        {timesheet.workedStart} – {timesheet.workedEnd}
                                                    </span>
                                                </div>

                                                <div className="flex flex-col gap-0.5">
                                                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Source</span>
                                                    <div className="mt-0.5">
                                                        <TimesheetSourceBadge source={timesheet.source} distanceMetres={timesheet.clockOutDistanceMetres} />
                                                    </div>
                                                </div>

                                                <div className="flex flex-col gap-0.5">
                                                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Status</span>
                                                    <span className={`text-xs font-semibold mt-0.5 ${
                                                        timesheet.status === 'APPROVED' ? 'text-emerald-600' :
                                                        timesheet.status === 'REJECTED' ? 'text-rose-600' :
                                                        'text-amber-600'
                                                    }`}>
                                                        {timesheet.status === 'APPROVED' ? 'Approved' :
                                                         timesheet.status === 'REJECTED' ? 'Rejected' :
                                                         'Pending review'}
                                                    </span>
                                                </div>
                                            </div>

                                            {timesheet.adminNote && (
                                                <div className="pt-3 border-t border-slate-100 flex flex-col gap-1">
                                                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Manager Note</span>
                                                    <p className="text-xs text-slate-600 leading-relaxed italic bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                                                        "{timesheet.adminNote}"
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
            )}
        </StaffSubpageShell>
    );
}
