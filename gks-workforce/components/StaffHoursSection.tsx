'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';
import { Timesheet } from '@/types';
import { getWeekStart, calculatePayrollRecord } from '@/lib/utils';
import StaffWeekPicker from '@/components/staff/StaffWeekPicker';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import { CalendarDays, Eye, EyeOff } from 'lucide-react';

export default function StaffHoursSection() {
    const { userData } = useAuth();
    const [selectedWeek, setSelectedWeek] = useState<Date>(getWeekStart(new Date()));

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

    // Real-time listeners instead of getDocs for instant cache-based week transitions
    useEffect(() => {
        if (!userData) return;

        const weekStart = new Date(selectedWeek);
        const weekEnd = new Date(selectedWeek);
        weekEnd.setDate(weekEnd.getDate() + 7);

        setLoading(true);

        const timesheetsQ = query(
            collection(db, 'timesheets'),
            where('staffId', '==', userData.id),
            where('weekStartDate', '==', Timestamp.fromDate(weekStart))
        );

        const unsubTimesheets = onSnapshot(timesheetsQ, (snapshot) => {
            const loaded: Timesheet[] = [];
            snapshot.forEach((d) => loaded.push({ id: d.id, ...d.data() } as Timesheet));
            setTimesheets(loaded);
            setLoading(false);
        });

        return () => unsubTimesheets();
    }, [selectedWeek, userData]);

    const changeWeek = (direction: 'prev' | 'next') => {
        const newWeek = new Date(selectedWeek);
        newWeek.setDate(newWeek.getDate() + (direction === 'next' ? 7 : -7));
        setSelectedWeek(getWeekStart(newWeek));
    };

    const totalPayableMinutes = timesheets.reduce((acc, ts) => {
        if (ts.status !== 'APPROVED') return acc;
        const payroll = calculatePayrollRecord(ts.workedStart, ts.workedEnd);
        return acc + payroll.payableMinutes;
    }, 0);

    const totalHours = totalPayableMinutes / 60;
    const grossPay = totalHours * (userData?.hourlyRate || 0);

    // Hours & Pay only shows approved timesheets — the Timesheets tab handles status tracking
    const approvedTimesheets = useMemo(() => {
        return timesheets
            .filter((ts) => ts.status === 'APPROVED')
            .sort((a, b) => b.date.toMillis() - a.date.toMillis());
    }, [timesheets]);

    return (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <div className="flex justify-center mb-5 shrink-0">
                <div className="w-full max-w-xs">
                    <StaffWeekPicker
                        weekStart={selectedWeek}
                        onPrev={() => changeWeek('prev')}
                        onNext={() => changeWeek('next')}
                    />
                </div>
            </div>

            {/* Hero Earnings Card */}
            <div className="border border-slate-200 rounded-xl bg-white overflow-hidden shrink-0 mb-5">
                <div className="p-5 pb-4">
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                            Estimated earnings
                        </span>
                        <button
                            type="button"
                            onClick={() => setShowPayInfo(!showPayInfo)}
                            aria-label={showPayInfo ? 'Hide pay amounts' : 'Show pay amounts'}
                            className="flex items-center justify-center w-8 h-8 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors cursor-pointer"
                        >
                            {showPayInfo ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                    </div>
                    <p className="text-3xl font-semibold text-slate-900 tabular-nums tracking-tight leading-tight">
                        {showPayInfo ? (
                            <>
                                <span className="text-lg font-medium text-slate-400 mr-0.5">$</span>
                                {grossPay.toLocaleString(undefined, {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                })}
                            </>
                        ) : (
                            <span className="text-slate-300 select-none tracking-widest">$•••••</span>
                        )}
                    </p>
                </div>
                <div className="border-t border-slate-100 grid grid-cols-2 divide-x divide-slate-100">
                    <div className="px-5 py-3.5">
                        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-0.5">Hours</span>
                        <span className="text-base font-semibold text-slate-800 tabular-nums">
                            {totalHours.toFixed(2)}
                            <span className="text-xs font-medium text-slate-400 ml-1">hrs</span>
                        </span>
                    </div>
                    <div className="px-5 py-3.5">
                        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-0.5">Rate</span>
                        <span className="text-base font-semibold text-slate-800 tabular-nums">
                            {showPayInfo ? (
                                <>
                                    <span className="text-xs font-medium text-slate-400 mr-0.5">$</span>
                                    {userData?.hourlyRate.toFixed(2)}
                                    <span className="text-xs font-medium text-slate-400 ml-0.5">/hr</span>
                                </>
                            ) : (
                                <span className="text-slate-300 select-none">•••••</span>
                            )}
                        </span>
                    </div>
                </div>
            </div>

            {/* Daily Breakdown — approved only */}
            {loading ? (
                <div className="flex-1 flex items-center justify-center">
                    <Spinner />
                </div>
            ) : approvedTimesheets.length === 0 ? (
                <EmptyState icon={CalendarDays} title="No approved hours" description="Hours will appear here once your timesheets are approved." />
            ) : (
                <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1 mb-2.5 shrink-0">Weekly Breakdown</h3>
                    <div className="flex-1 overflow-y-auto pr-0.5 pb-4 space-y-3">
                        {approvedTimesheets.map((ts) => {
                            const payroll = calculatePayrollRecord(ts.workedStart, ts.workedEnd);
                            const hours = payroll.payableMinutes / 60;
                            const isUnrostered = !ts.shiftId;

                            const dateObj = ts.date.toDate();
                            const formattedDate = dateObj.toLocaleDateString('en-US', {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric'
                            });

                            return (
                                <div
                                    key={ts.id}
                                    className="border-l-4 border-l-emerald-500 border border-slate-200 rounded-xl bg-white p-4 sm:p-5"
                                >
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-semibold text-slate-800">{formattedDate}</span>
                                                {isUnrostered && (
                                                    <span className="text-[9px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0 leading-relaxed uppercase tracking-wider">
                                                        Extra
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs text-slate-500 font-medium mt-1.5">
                                                {ts.workedStart} – {ts.workedEnd}
                                            </p>
                                        </div>
                                        <div className="shrink-0 text-right">
                                            <p className="text-sm font-semibold text-slate-800 tabular-nums">{hours.toFixed(2)} hrs</p>
                                            <p className="text-xs font-medium tabular-nums mt-1.5 text-emerald-600">
                                                {showPayInfo
                                                    ? `$${(hours * (userData?.hourlyRate || 0)).toFixed(2)}`
                                                    : '•••'}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
