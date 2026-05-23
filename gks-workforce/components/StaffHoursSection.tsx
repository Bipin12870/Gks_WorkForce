'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { Shift, Timesheet } from '@/types';
import { getWeekStart, formatDate, calculateHours } from '@/lib/utils';
import StaffWeekPicker from '@/components/staff/StaffWeekPicker';
import StaffStatCard from '@/components/staff/StaffStatCard';
import StaffListRow from '@/components/staff/StaffListRow';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import Icon from '@/components/ui/Icon';
import { CalendarDays, Eye, EyeOff } from 'lucide-react';

export default function StaffHoursSection() {
    const { userData } = useAuth();
    const [selectedWeek, setSelectedWeek] = useState<Date>(getWeekStart(new Date()));
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
    const [loading, setLoading] = useState(true);
    const [showPayInfo, setShowPayInfo] = useState(true);

    useEffect(() => {
        const saved = localStorage.getItem('gks_show_pay_info');
        if (saved !== null) {
            setShowPayInfo(saved === 'true');
        }
    }, []);

    useEffect(() => {
        localStorage.setItem('gks_show_pay_info', String(showPayInfo));
    }, [showPayInfo]);

    useEffect(() => {
        loadData();
    }, [selectedWeek, userData]);

    const loadData = async () => {
        if (!userData) return;

        setLoading(true);

        const weekStart = new Date(selectedWeek);
        const weekEnd = new Date(selectedWeek);
        weekEnd.setDate(weekEnd.getDate() + 7);

        try {
            const shiftsQ = query(
                collection(db, 'shifts'),
                where('staffId', '==', userData.id),
                where('date', '>=', Timestamp.fromDate(weekStart)),
                where('date', '<', Timestamp.fromDate(weekEnd)),
                where('status', '==', 'APPROVED')
            );
            const shiftsSnapshot = await getDocs(shiftsQ);
            const loadedShifts: Shift[] = [];
            shiftsSnapshot.forEach((d) => {
                loadedShifts.push({ id: d.id, ...d.data() } as Shift);
            });
            loadedShifts.sort((a, b) => {
                const dateDiff = a.date.toMillis() - b.date.toMillis();
                if (dateDiff !== 0) return dateDiff;
                return a.startTime.localeCompare(b.startTime);
            });
            setShifts(loadedShifts);

            const timesheetsQ = query(
                collection(db, 'timesheets'),
                where('staffId', '==', userData.id),
                where('weekStartDate', '==', Timestamp.fromDate(weekStart))
            );
            const timesheetsSnapshot = await getDocs(timesheetsQ);
            const loadedTimesheets: Timesheet[] = [];
            timesheetsSnapshot.forEach((d) => {
                loadedTimesheets.push({ id: d.id, ...d.data() } as Timesheet);
            });
            setTimesheets(loadedTimesheets);
        } catch (error) {
            console.error('Error loading hours data:', error);
        } finally {
            setLoading(false);
        }
    };

    const changeWeek = (direction: 'prev' | 'next') => {
        const newWeek = new Date(selectedWeek);
        newWeek.setDate(newWeek.getDate() + (direction === 'next' ? 7 : -7));
        setSelectedWeek(getWeekStart(newWeek));
    };

    let totalHours = 0;
    timesheets
        .filter((ts) => ts.status === 'APPROVED')
        .forEach((ts) => {
            totalHours += calculateHours(ts.workedStart, ts.workedEnd);
        });

    const grossPay = totalHours * (userData?.hourlyRate || 0);

    const unifiedLog = useMemo(() => {
        const log: Array<{
            id: string;
            date: Timestamp;
            shift: Shift | null;
            timesheet: Timesheet | undefined;
            type: string;
        }> = shifts.map((shift) => {
            const ts = timesheets.find((t) => t.shiftId === shift.id);
            return {
                id: shift.id || `shift-${Math.random()}`,
                date: shift.date,
                shift,
                timesheet: ts,
                type: 'ROSTERED',
            };
        });

        timesheets.forEach((ts) => {
            const hasShiftInCurrentList = shifts.some((s) => s.id === ts.shiftId);
            if (!ts.shiftId || !hasShiftInCurrentList) {
                log.push({
                    id: ts.id || `ts-${Math.random()}`,
                    date: ts.date,
                    shift: null,
                    timesheet: ts,
                    type: 'UNROSTERED',
                });
            }
        });

        return log.sort((a, b) => b.date.toMillis() - a.date.toMillis());
    }, [shifts, timesheets]);

    const statusVariant = (status: string) => {
        if (status === 'APPROVED') return 'success' as const;
        if (status === 'REJECTED') return 'danger' as const;
        return 'warning' as const;
    };

    return (
        <section>
            <div className="mb-4">
                <StaffWeekPicker
                    weekStart={selectedWeek}
                    onPrev={() => changeWeek('prev')}
                    onNext={() => changeWeek('next')}
                    trailing={
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowPayInfo(!showPayInfo)}
                            aria-label={showPayInfo ? 'Hide pay amounts' : 'Show pay amounts'}
                            className="min-h-11 min-w-11 p-0"
                        >
                            <Icon icon={showPayInfo ? EyeOff : Eye} size="md" />
                        </Button>
                    }
                />
            </div>

            <div className="grid grid-cols-3 gap-2 mb-5">
                <StaffStatCard label="Weekly hours" value={totalHours.toFixed(2)} suffix="hrs" accent="blue" />
                <StaffStatCard
                    label="Hourly rate"
                    value={showPayInfo ? userData?.hourlyRate.toFixed(2) : '•••••'}
                    prefix="$"
                    accent="gray"
                />
                <StaffStatCard
                    label="Estimated gross"
                    value={
                        showPayInfo
                            ? grossPay.toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                              })
                            : '•••••'
                    }
                    prefix="$"
                    accent="green"
                />
            </div>

            {loading ? (
                <Spinner className="py-12" />
            ) : unifiedLog.length === 0 ? (
                <EmptyState icon={CalendarDays} title="No activity" description="Approved timesheets will appear here." />
            ) : (
                <div className="space-y-2">
                    {unifiedLog.map((item) => {
                        const ts = item.timesheet;
                        const shift = item.shift;
                        const isApproved = ts?.status === 'APPROVED';
                        const hours = isApproved ? calculateHours(ts!.workedStart, ts!.workedEnd) : 0;
                        const rosteredHours = shift ? calculateHours(shift.startTime, shift.endTime) : 0;

                        return (
                            <StaffListRow
                                key={item.id}
                                icon={CalendarDays}
                                iconClassName={isApproved ? 'text-green-600' : 'text-gray-400'}
                                title={
                                    <span className="text-section-title">{formatDate(item.date.toDate())}</span>
                                }
                                meta={
                                    <>
                                        {item.type === 'UNROSTERED' && <Badge variant="warning">Unrostered</Badge>}
                                        {ts && <Badge variant={statusVariant(ts.status)}>{ts.status}</Badge>}
                                    </>
                                }
                                subtitle={
                                    <p className="text-label">
                                        {isApproved
                                            ? `${ts!.workedStart} – ${ts!.workedEnd}`
                                            : shift
                                              ? `${shift.startTime} – ${shift.endTime} (rostered)`
                                              : 'Worked outside roster'}
                                    </p>
                                }
                                trailing={
                                    isApproved ? (
                                        <>
                                            <p className="text-section-title tabular-nums">{hours.toFixed(2)} hrs</p>
                                            <p className="text-label text-green-700 tabular-nums">
                                                {showPayInfo
                                                    ? `$${(hours * (userData?.hourlyRate || 0)).toFixed(2)}`
                                                    : 'Hidden'}
                                            </p>
                                        </>
                                    ) : (
                                        <>
                                            <p className="text-sm text-gray-300 line-through tabular-nums">
                                                {rosteredHours > 0 ? `${rosteredHours.toFixed(2)} hrs` : '—'}
                                            </p>
                                            <p className="text-label">{ts ? 'Pending approval' : 'No timesheet'}</p>
                                        </>
                                    )
                                }
                            />
                        );
                    })}
                </div>
            )}
        </section>
    );
}
