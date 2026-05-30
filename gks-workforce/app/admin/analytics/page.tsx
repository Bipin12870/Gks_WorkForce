'use client';

import { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase-db';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { User, Timesheet, Shift } from '@/types';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import AdminWeekPicker from '@/components/admin/AdminWeekPicker';
import AdminStatCard from '@/components/admin/AdminStatCard';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import { DollarSign, Clock, TrendingUp } from 'lucide-react';
import { getWeekStart, calculatePayrollRecord } from '@/lib/utils';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    LineChart,
    Line
} from 'recharts';

export default function AnalyticsPage() {

    const [staffList, setStaffList] = useState<User[]>([]);
    const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
    const [shifts, setShifts] = useState<Shift[]>([]);

    // Default to current week
    const [weekStart, setWeekStart] = useState<Date>(() => {
        const now = new Date();
        return getWeekStart(now);
    });

    const [loading, setLoading] = useState(true);

    // ─────────────────────────────────────────────────────────
    // DATA FETCHING
    // ─────────────────────────────────────────────────────────
    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                // 1. Fetch Staff (Active only)
                const usersQ = query(
                    collection(db, 'users'),
                    where('role', '==', 'STAFF'),
                    where('isActive', '==', true)
                );
                const usersSnap = await getDocs(usersQ);
                const usersData = usersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
                setStaffList(usersData);

                // 2. Fetch Timesheets for selected week
                const startOfSelectedWeek = new Date(weekStart);
                startOfSelectedWeek.setHours(0, 0, 0, 0);

                const endOfSelectedWeek = new Date(startOfSelectedWeek);
                endOfSelectedWeek.setDate(endOfSelectedWeek.getDate() + 7);

                const tsQ = query(
                    collection(db, 'timesheets'),
                    where('date', '>=', Timestamp.fromDate(startOfSelectedWeek)),
                    where('date', '<', Timestamp.fromDate(endOfSelectedWeek))
                );
                const tsSnap = await getDocs(tsQ);
                const tsData = tsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Timesheet));
                setTimesheets(tsData);

                // 3. Fetch Shifts for selected week (APPROVED only)
                const shiftsQ = query(
                    collection(db, 'shifts'),
                    where('date', '>=', Timestamp.fromDate(startOfSelectedWeek)),
                    where('date', '<', Timestamp.fromDate(endOfSelectedWeek)),
                    where('status', '==', 'APPROVED')
                );
                const shiftsSnap = await getDocs(shiftsQ);
                const shiftsData = shiftsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Shift));
                setShifts(shiftsData);

            } catch (err) {
                console.error("Error fetching analytics data", err);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [weekStart]);

    // ─────────────────────────────────────────────────────────
    // DATA AGGREGATION
    // ─────────────────────────────────────────────────────────

    const analyticsData = useMemo(() => {
        let totalWages = 0; // Only approved
        let projectedWages = 0; // Based on roster
        let totalActualHours = 0; // Only approved
        let totalScheduledHours = 0;

        // Group by staff for Bar Chart
        const staffCostMap: Record<string, { name: string; cost: number; rosterCost: number; actualHours: number; scheduledHours: number }> = {};

        staffList.forEach(staff => {
            staffCostMap[staff.id] = {
                name: staff.name.split(' ')[0],
                cost: 0,
                rosterCost: 0,
                actualHours: 0,
                scheduledHours: 0
            };
        });

        // Group by Day for Line Chart
        const dayMap: Record<string, { name: string; Scheduled: number; Actual: number; date: Date }> = {};
        for (let i = 0; i < 7; i++) {
            const d = new Date(weekStart);
            d.setDate(d.getDate() + i);
            const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
            dayMap[dayName] = { name: dayName, Scheduled: 0, Actual: 0, date: d };
        }

        // Process Shifts (Scheduled & Projected Cost)
        shifts.forEach(shift => {
            const payroll = calculatePayrollRecord(shift.startTime, shift.endTime);
            const hours = payroll.rawMinutes / 60;
            totalScheduledHours += hours;

            const staff = staffList.find(s => s.id === shift.staffId);
            const rate = staff?.hourlyRate || 0;
            const shiftRosterCost = hours * rate;
            projectedWages += shiftRosterCost;

            if (staffCostMap[shift.staffId]) {
                staffCostMap[shift.staffId].scheduledHours += hours;
                staffCostMap[shift.staffId].rosterCost += shiftRosterCost;
            }

            const shiftDate = shift.date.toDate();
            const dayName = shiftDate.toLocaleDateString('en-US', { weekday: 'short' });
            if (dayMap[dayName]) {
                dayMap[dayName].Scheduled += hours;
            }
        });

        // Process Timesheets (Actual & Costs - ONLY APPROVED)
        timesheets.forEach(ts => {
            if (ts.status !== 'APPROVED') return;

            const payroll = calculatePayrollRecord(ts.workedStart, ts.workedEnd);
            const hours = payroll.payableMinutes / 60;
            totalActualHours += hours;

            const staff = staffList.find(s => s.id === ts.staffId);
            const rate = staff?.hourlyRate || 0;
            const cost = hours * rate;

            totalWages += cost;

            if (staffCostMap[ts.staffId]) {
                staffCostMap[ts.staffId].actualHours += hours;
                staffCostMap[ts.staffId].cost += cost;
            }

            const tsDate = ts.date.toDate();
            const dayName = tsDate.toLocaleDateString('en-US', { weekday: 'short' });
            if (dayMap[dayName]) {
                dayMap[dayName].Actual += hours;
            }
        });

        const staffChartData = Object.values(staffCostMap).sort((a, b) => b.rosterCost - a.rosterCost);
        const dayChartData = Object.values(dayMap).sort((a, b) => a.date.getTime() - b.date.getTime());

        const laborVariance = totalActualHours - totalScheduledHours;

        return {
            totalWages,
            projectedWages,
            totalActualHours,
            totalScheduledHours,
            laborVariance,
            staffChartData,
            dayChartData
        };

    }, [staffList, timesheets, shifts, weekStart]);

    // ─────────────────────────────────────────────────────────
    // UI HANDLERS
    // ─────────────────────────────────────────────────────────
    const handlePreviousWeek = () => {
        const newStart = new Date(weekStart);
        newStart.setDate(newStart.getDate() - 7);
        setWeekStart(newStart);
    };

    const handleNextWeek = () => {
        const newStart = new Date(weekStart);
        newStart.setDate(newStart.getDate() + 7);
        setWeekStart(newStart);
    };

    const handleCurrentWeek = () => {
        setWeekStart(getWeekStart(new Date()));
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(amount);
    };

    return (
        <>
            <AdminPageHeader
                description="Labor cost, hours trends, and roster coverage for the selected week."
            />

            <div className="admin-toolbar mb-6">
                <AdminWeekPicker
                    weekStart={weekStart}
                    onPrev={handlePreviousWeek}
                    onNext={handleNextWeek}
                />
                <Button variant="ghost-primary" size="sm" onClick={handleCurrentWeek}>
                    Current week
                </Button>
            </div>
                    {loading ? (
                        <Spinner className="py-20" label="Loading analytics…" />
                    ) : (
                        <div className="space-y-8">

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <AdminStatCard
                                    label="Actual wages (approved)"
                                    value={formatCurrency(analyticsData.totalWages)}
                                    subtext={`Budgeted ${formatCurrency(analyticsData.projectedWages)} from roster`}
                                    icon={DollarSign}
                                />
                                <AdminStatCard
                                    label="Total hours"
                                    value={`${analyticsData.totalActualHours.toFixed(1)} hrs`}
                                    subtext={`vs ${analyticsData.totalScheduledHours.toFixed(1)} hrs scheduled`}
                                    icon={Clock}
                                />
                                <AdminStatCard
                                    label="Labor variance"
                                    value={`${analyticsData.laborVariance > 0 ? '+' : ''}${analyticsData.laborVariance.toFixed(1)} hrs`}
                                    subtext={
                                        analyticsData.laborVariance > 0
                                            ? 'Worked more than rostered'
                                            : 'Worked less than rostered'
                                    }
                                    icon={TrendingUp}
                                    variant={analyticsData.laborVariance > 0 ? 'warning' : 'success'}
                                />
                            </div>

                            {/* Charts Row */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                                {/* Employee Cost Breakdown */}
                                <div className="card-base p-6 flex flex-col">
                                    <div className="mb-6">
                                        <h2 className="text-section-title">
                                            Cost: budget vs actual
                                        </h2>
                                        <p className="text-sm text-gray-500 mt-1">
                                            Comparison of rostered costs vs approved pay
                                        </p>
                                    </div>
                                    <div className="h-[300px] w-full">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={analyticsData.staffChartData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                                <XAxis
                                                    dataKey="name"
                                                    axisLine={false}
                                                    tickLine={false}
                                                    tick={{ fill: '#6b7280', fontSize: 12, fontWeight: 500 }}
                                                    dy={10}
                                                />
                                                <YAxis
                                                    axisLine={false}
                                                    tickLine={false}
                                                    tick={{ fill: '#6b7280', fontSize: 12, fontWeight: 500 }}
                                                    tickFormatter={(value) => `$${value}`}
                                                />
                                                <Tooltip
                                                    cursor={{ fill: '#f3f4f6' }}
                                                    contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                                    formatter={(value, name) => [formatCurrency(Number(value ?? 0)), String(name ?? '')]}
                                                />
                                                <Legend verticalAlign="top" height={36} />
                                                <Bar dataKey="rosterCost" name="Rostered" fill="#bfdbfe" radius={[4, 4, 0, 0]} maxBarSize={40} />
                                                <Bar dataKey="cost" name="Approved" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={40} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>

                                {/* Scheduled vs Actual Line Chart */}
                                <div className="card-base p-6 flex flex-col">
                                    <div className="mb-6">
                                        <h2 className="text-section-title">
                                            Rostered vs worked hours
                                        </h2>
                                        <p className="text-sm text-gray-500 mt-1">
                                            Daily breakdown of planned hours vs actual worked time
                                        </p>
                                    </div>
                                    <div className="h-[300px] w-full">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <LineChart data={analyticsData.dayChartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                                <XAxis
                                                    dataKey="name"
                                                    axisLine={false}
                                                    tickLine={false}
                                                    tick={{ fill: '#6b7280', fontSize: 12, fontWeight: 500 }}
                                                    dy={10}
                                                />
                                                <YAxis
                                                    axisLine={false}
                                                    tickLine={false}
                                                    tick={{ fill: '#6b7280', fontSize: 12, fontWeight: 500 }}
                                                />
                                                <Tooltip
                                                    contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                                    formatter={(value) => [`${Number(value ?? 0).toFixed(1)} hrs`, '']}
                                                />
                                                <Legend
                                                    verticalAlign="top"
                                                    height={36}
                                                    iconType="circle"
                                                    wrapperStyle={{ fontSize: '12px', fontWeight: 600, color: '#4b5563' }}
                                                />
                                                <Line
                                                    type="monotone"
                                                    dataKey="Scheduled"
                                                    stroke="#94a3b8"
                                                    strokeWidth={3}
                                                    dot={{ r: 4, strokeWidth: 2 }}
                                                    activeDot={{ r: 6 }}
                                                />
                                                <Line
                                                    type="monotone"
                                                    dataKey="Actual"
                                                    stroke="#10b981"
                                                    strokeWidth={3}
                                                    dot={{ r: 4, strokeWidth: 2 }}
                                                    activeDot={{ r: 6 }}
                                                />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>

                            </div>
                        </div>
                    )}
        </>
    );
}
