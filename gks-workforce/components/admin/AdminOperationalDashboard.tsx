'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { collection, query, where, onSnapshot, Timestamp, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import AdminStatCard from '@/components/admin/AdminStatCard';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import {
    AlertTriangle,
    ClipboardCheck,
    Clock,
    ArrowRight,
} from 'lucide-react';
import { Shift, User, TimeRecord } from '@/types';
import { parseTime, formatTimeTo12Hour } from '@/lib/utils';



interface CrewStatus {
    staffId: string;
    name: string;
    initials: string;
    status: 'working' | 'unscheduled_working' | 'late' | 'upcoming' | 'completed' | 'off';
    shiftTime?: string;
    clockInTime?: string;
    clockOutTime?: string;
}

export default function AdminOperationalDashboard() {
    const router = useRouter();
    const [pendingTimesheets, setPendingTimesheets] = useState(0);
    const [flaggedCount, setFlaggedCount] = useState(0);
    const [todayShiftsCount, setTodayShiftsCount] = useState(0);

    const [staffList, setStaffList] = useState<User[]>([]);
    const [todayShifts, setTodayShifts] = useState<Shift[]>([]);
    const [activeRecords, setActiveRecords] = useState<TimeRecord[]>([]);
    const [completedRecordsToday, setCompletedRecordsToday] = useState<TimeRecord[]>([]);

    // Time states for checking late shifts in real-time
    const [nowTime, setNowTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setNowTime(new Date()), 30_000);
        return () => clearInterval(timer);
    }, []);

    // 1. Fetch staff profiles
    useEffect(() => {
        const loadStaff = async () => {
            const snapshot = await getDocs(collection(db, 'users'));
            const list: User[] = [];
            snapshot.forEach((doc) => {
                const u = { id: doc.id, ...doc.data() } as User;
                if (u.isActive !== false && u.role === 'STAFF') {
                    list.push(u);
                }
            });
            setStaffList(list.sort((a, b) => a.name.localeCompare(b.name)));
        };
        loadStaff();
    }, []);

    // 2. Real-time listeners for dashboard alerts & status
    useEffect(() => {
        const qAll = query(collection(db, 'timesheets'), where('status', '==', 'PENDING'));
        const qFlagged = query(
            collection(db, 'timesheets'),
            where('status', '==', 'PENDING'),
            where('requiresAdminNote', '==', true)
        );

        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const endOfToday = new Date();
        endOfToday.setHours(23, 59, 59, 999);

        // Fetch today's rostered shifts
        const qShifts = query(
            collection(db, 'shifts'),
            where('status', '==', 'APPROVED'),
            where('date', '>=', Timestamp.fromDate(startOfToday)),
            where('date', '<=', Timestamp.fromDate(endOfToday))
        );

        // Fetch active clock-ins
        const qActiveClocks = query(
            collection(db, 'timeRecords'),
            where('clockOutTime', '==', null)
        );

        // Fetch completed shifts today
        const qCompletedClocks = query(
            collection(db, 'timeRecords'),
            where('clockInTime', '>=', Timestamp.fromDate(startOfToday)),
            where('clockInTime', '<=', Timestamp.fromDate(endOfToday))
        );

        const unsubPending = onSnapshot(qAll, (s) => setPendingTimesheets(s.size));
        const unsubFlagged = onSnapshot(qFlagged, (s) => setFlaggedCount(s.size));
        const unsubShifts = onSnapshot(qShifts, (snapshot) => {
            const list: Shift[] = [];
            snapshot.forEach((doc) => {
                list.push({ id: doc.id, ...doc.data() } as Shift);
            });
            setTodayShifts(list);
            setTodayShiftsCount(list.length);
        });
        const unsubActive = onSnapshot(qActiveClocks, (snapshot) => {
            const list: TimeRecord[] = [];
            const todayStartMs = startOfToday.getTime();
            snapshot.forEach((doc) => {
                const rec = { id: doc.id, ...doc.data() } as TimeRecord;
                if (rec.clockInTime && rec.clockInTime.toDate().getTime() >= todayStartMs) {
                    list.push(rec);
                }
            });
            setActiveRecords(list);
        });
        const unsubCompleted = onSnapshot(qCompletedClocks, (snapshot) => {
            const list: TimeRecord[] = [];
            snapshot.forEach((doc) => {
                const rec = { id: doc.id, ...doc.data() } as TimeRecord;
                if (rec.clockOutTime) {
                    list.push(rec);
                }
            });
            setCompletedRecordsToday(list);
        });

        return () => {
            unsubPending();
            unsubFlagged();
            unsubShifts();
            unsubActive();
            unsubCompleted();
        };
    }, []);

    // 3. Compute live crew status
    const crewStatusList = useMemo((): CrewStatus[] => {
        return staffList.map((member) => {
            const initials = member.name
                .split(' ')
                .map((n) => n[0])
                .join('')
                .toUpperCase()
                .substring(0, 2);

            // Find rostered shift for today
            const shift = todayShifts.find((s) => s.staffId === member.id);
            // Find active record
            const activeRecord = activeRecords.find((r) => r.staffId === member.id);
            // Find any completed records today
            const completedRecord = completedRecordsToday.find((r) => r.staffId === member.id);

            let status: CrewStatus['status'] = 'off';
            let clockInTime: string | undefined;
            let clockOutTime: string | undefined;

            if (activeRecord) {
                status = shift ? 'working' : 'unscheduled_working';
                const dateObj = activeRecord.clockInTime.toDate();
                clockInTime = formatTimeTo12Hour(dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }));
            } else if (completedRecord) {
                status = 'completed';
                const dateIn = completedRecord.clockInTime.toDate();
                const dateOut = completedRecord.clockOutTime!.toDate();
                clockInTime = formatTimeTo12Hour(dateIn.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }));
                clockOutTime = formatTimeTo12Hour(dateOut.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }));
            } else if (shift) {
                // Check if shift is late
                const [startH, startM] = shift.startTime.split(':').map(Number);
                const shiftStart = new Date(nowTime);
                shiftStart.setHours(startH, startM, 0, 0);
                
                // Allow a 10 minute grace period
                const lateLimit = new Date(shiftStart.getTime() + 10 * 60 * 1000);
                
                status = nowTime > lateLimit ? 'late' : 'upcoming';
            }

            return {
                staffId: member.id,
                name: member.name,
                initials,
                status,
                shiftTime: shift ? `${formatTimeTo12Hour(shift.startTime)}–${formatTimeTo12Hour(shift.endTime)}` : undefined,
                clockInTime,
                clockOutTime,
            };
        });
    }, [staffList, todayShifts, activeRecords, completedRecordsToday, nowTime]);

    // Active working counts
    const activeWorkingCount = useMemo(() => {
        return crewStatusList.filter((c) => c.status === 'working' || c.status === 'unscheduled_working').length;
    }, [crewStatusList]);

    // Compute hour totals for comparison bar
    const scheduledHoursTotal = useMemo(() => {
        return todayShifts.reduce((acc, s) => {
            const start = parseTime(s.startTime);
            const end = parseTime(s.endTime);
            const startMin = start.hours * 60 + start.minutes;
            const endMin = end.hours * 60 + end.minutes;
            return acc + (endMin - startMin) / 60;
        }, 0);
    }, [todayShifts]);

    const workedHoursTotal = useMemo(() => {
        let total = 0;
        // Count active workers up to now
        activeRecords.forEach((rec) => {
            const inMs = rec.clockInTime.toDate().getTime();
            const diffHours = Math.max(0, (nowTime.getTime() - inMs) / 3600000);
            total += diffHours;
        });
        // Count completed shifts
        completedRecordsToday.forEach((rec) => {
            if (rec.hoursWorked) {
                total += rec.hoursWorked;
            }
        });
        return total;
    }, [activeRecords, completedRecordsToday, nowTime]);


    return (
        <div className="space-y-6">
            {/* ── Greeting Banner ── */}
            <div className="relative overflow-hidden bg-gradient-to-r from-blue-50 via-indigo-50/60 to-slate-50 border border-slate-200/80 rounded-3xl p-6 sm:p-8 text-slate-800 shadow-xs">
                <div className="absolute top-0 right-0 -mt-6 -mr-6 w-32 h-32 bg-blue-100/30 rounded-full blur-2xl" />
                <div className="absolute bottom-0 left-0 -mb-6 -ml-6 w-48 h-48 bg-indigo-100/40 rounded-full blur-3xl" />
                
                <div className="relative z-10">

                    <h1 className="text-xl sm:text-3xl font-semibold tracking-tight mt-3 text-slate-900">
                        Good Evening, Tony
                    </h1>
                    <p className="text-sm sm:text-base text-slate-600 mt-1.5 max-w-md">
                        Today is {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}. 
                        There are currently <strong className="text-blue-700 font-semibold">{activeWorkingCount} staff</strong> clocked in.
                    </p>
                </div>
            </div>

            {/* ── Key Metrics ── */}
            <section className="grid grid-cols-1 sm:grid-cols-3 gap-4" aria-label="Key metrics">
                <AdminStatCard
                    label="Pending Approvals"
                    value={String(pendingTimesheets)}
                    subtext="Timesheets to review"
                    icon={ClipboardCheck}
                    variant={pendingTimesheets > 0 ? 'warning' : 'default'}
                    onClick={() => router.push('/admin/timesheets?filter=pending')}
                />
                <AdminStatCard
                    label="Flagged Issues"
                    value={String(flaggedCount)}
                    subtext="Requires admin note"
                    icon={AlertTriangle}
                    variant={flaggedCount > 0 ? 'danger' : 'default'}
                    onClick={() => router.push('/admin/timesheets?filter=flagged')}
                />
                <AdminStatCard
                    label="Scheduled Today"
                    value={`${scheduledHoursTotal.toFixed(1)} hrs`}
                    subtext={`${todayShiftsCount} shifts approved`}
                    icon={Clock}
                    onClick={() => router.push('/admin/roster')}
                />
            </section>

            {/* ── Main Dashboard Layout Grid ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* ── Left Column: Live Shop Status Monitor (2/3 width) ── */}
                <div className="lg:col-span-2">
                    {/* Live Shop Monitor Card */}
                    <Card className="p-5 shadow-sm border border-slate-200 h-full">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
                            <div>
                                <h2 className="text-base font-semibold text-slate-800">Live Shop Crew</h2>
                                <p className="text-xs text-slate-400 mt-0.5">Real-time attendance & schedule mapping</p>
                            </div>
                            <span className="flex h-2 w-2 relative">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            </span>
                        </div>

                        {/* Crew List */}
                        <div className="divide-y divide-slate-100 max-h-[360px] overflow-y-auto pr-1">
                            {crewStatusList.length === 0 ? (
                                <div className="text-center py-8">
                                    <p className="text-sm text-slate-400">No staff members configured.</p>
                                </div>
                            ) : crewStatusList.filter(c => c.status !== 'off').length === 0 ? (
                                <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                                    <p className="text-sm font-semibold text-slate-500">No shifts scheduled for today.</p>
                                    <button 
                                        onClick={() => router.push('/admin/roster')}
                                        className="text-xs font-semibold text-blue-600 hover:text-blue-700 mt-2 block mx-auto underline"
                                    >
                                        Go schedule shifts
                                    </button>
                                </div>
                            ) : (
                                crewStatusList
                                    .filter((c) => c.status !== 'off')
                                    .map((member) => (
                                        <div key={member.staffId} className="flex items-center justify-between py-3">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 shadow-xs border ${
                                                    member.status === 'working' || member.status === 'unscheduled_working'
                                                        ? 'bg-emerald-100 border-emerald-200 text-emerald-700'
                                                        : member.status === 'late'
                                                            ? 'bg-red-100 border-red-200 text-red-700 animate-pulse'
                                                            : member.status === 'completed'
                                                                ? 'bg-slate-100 border-slate-200 text-slate-600'
                                                                : 'bg-blue-50 border-blue-100 text-blue-700'
                                                }`}>
                                                    {member.initials}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-sm font-semibold text-slate-800 truncate">{member.name}</p>
                                                    <p className="text-xs text-slate-400 font-medium">
                                                        {member.status === 'working' && `Clocked in: ${member.clockInTime}`}
                                                        {member.status === 'unscheduled_working' && `Unscheduled · Clocked in: ${member.clockInTime}`}
                                                        {member.status === 'completed' && `Finished · Clocked: ${member.clockInTime}–${member.clockOutTime}`}
                                                        {member.status === 'late' && `Absent · Rostered: ${member.shiftTime}`}
                                                        {member.status === 'upcoming' && `Rostered: ${member.shiftTime}`}
                                                    </p>
                                                </div>
                                            </div>
                                            
                                            {/* Status Badge */}
                                            <div>
                                                {member.status === 'working' && (
                                                    <Badge variant="success">Clocked In</Badge>
                                                )}
                                                {member.status === 'unscheduled_working' && (
                                                    <Badge variant="success">Unscheduled</Badge>
                                                )}
                                                {member.status === 'completed' && (
                                                    <Badge variant="neutral">Completed</Badge>
                                                )}
                                                {member.status === 'late' && (
                                                    <Badge variant="danger">Absent / Late</Badge>
                                                )}
                                                {member.status === 'upcoming' && (
                                                    <Badge variant="neutral">Scheduled</Badge>
                                                )}
                                            </div>
                                        </div>
                                    ))
                            )}
                        </div>
                    </Card>
                </div>

                {/* ── Right Column: Labor Hours Progress (1/3 width) ── */}
                <div className="lg:col-span-1">
                    <Card className="p-5 shadow-sm border border-slate-200 h-full flex flex-col justify-between">
                        <div>
                            <h2 className="text-base font-semibold text-slate-800">Labor Hours Progress</h2>
                            <p className="text-xs text-slate-400 mt-0.5 mb-6">Comparison of rostered budget vs. actual hours today</p>
                            
                            <div className="space-y-4">
                                <div className="flex justify-between text-xs font-semibold text-slate-600">
                                    <span>Rostered Budget: {scheduledHoursTotal.toFixed(1)} hrs</span>
                                    <span className="text-blue-600 font-semibold">Actual: {workedHoursTotal.toFixed(1)} hrs</span>
                                </div>
                                <div className="w-full h-3.5 bg-slate-100 rounded-full overflow-hidden flex">
                                    <div 
                                        className="bg-blue-600 h-full rounded-full transition-all duration-500" 
                                        style={{ width: `${scheduledHoursTotal > 0 ? Math.min(100, (workedHoursTotal / scheduledHoursTotal) * 100) : 0}%` }}
                                    />
                                </div>
                                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
                                    <span>0%</span>
                                    <span>{scheduledHoursTotal > 0 ? `${((workedHoursTotal / scheduledHoursTotal) * 100).toFixed(0)}% used` : 'No hours allocated'}</span>
                                    <span>100%+</span>
                                </div>
                            </div>
                        </div>
                        
                        <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400 font-medium">
                            <span>Last updated: just now</span>
                            <button 
                                onClick={() => router.push('/admin/hours')}
                                className="text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1 transition-colors"
                            >
                                View summary <ArrowRight size={12} />
                            </button>
                        </div>
                    </Card>
                </div>

            </div>
        </div>
    );
}
