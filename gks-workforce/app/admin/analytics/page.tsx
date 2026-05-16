'use client';

import { useState, useEffect, useMemo } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, Timestamp, orderBy } from 'firebase/firestore';
import { User, Timesheet, Shift } from '@/types';
import { useRouter } from 'next/navigation';
import Logo from '@/components/Logo';
import { getWeekStart, formatDate } from '@/lib/utils';
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
    const { userData } = useAuth();
    const router = useRouter();

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

    // Helper: calculate hours difference between "HH:mm" strings
    const calculateHours = (start: string, end: string): number => {
        if (!start || !end) return 0;
        const [sh, sm] = start.split(':').map(Number);
        const [eh, em] = end.split(':').map(Number);
        let diff = (eh * 60 + em) - (sh * 60 + sm);
        if (diff < 0) diff += 24 * 60; // Cross-midnight
        return diff / 60;
    };

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
            const hours = calculateHours(shift.startTime, shift.endTime);
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

            const hours = calculateHours(ts.workedStart, ts.workedEnd);
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
        <ProtectedRoute requiredRole="ADMIN">
            <div className="min-h-screen bg-background text-gray-900 pb-12">
                {/* Header */}
                <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="flex items-center gap-6">
                                <Logo width={100} height={35} />
                                <div className="border-l border-gray-200 pl-6">
                                    <button
                                        onClick={() => router.push('/dashboard')}
                                        className="text-blue-600 hover:text-blue-700 text-xs font-bold uppercase tracking-wider mb-0.5 block transition-colors"
                                    >
                                        ← Dashboard
                                    </button>
                                    <h1 className="text-xl font-bold text-gray-900 tracking-tight">
                                        Analytics
                                    </h1>
                                </div>
                            </div>

                            {/* Date Navigation */}
                            <div className="flex items-center gap-2 bg-gray-50 p-1 rounded-xl border border-gray-200">
                                <button
                                    onClick={handlePreviousWeek}
                                    className="p-2 hover:bg-white rounded-lg text-gray-600 hover:text-gray-900 transition-colors hover:shadow-sm"
                                    aria-label="Previous week"
                                >
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                    </svg>
                                </button>
                                
                                <div className="px-4 py-1 text-center min-w-[160px]">
                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                                        Week Starting
                                    </p>
                                    <p className="text-sm font-semibold text-gray-900 whitespace-nowrap">
                                        {formatDate(weekStart)}
                                    </p>
                                </div>

                                <button
                                    onClick={handleNextWeek}
                                    className="p-2 hover:bg-white rounded-lg text-gray-600 hover:text-gray-900 transition-colors hover:shadow-sm"
                                    aria-label="Next week"
                                >
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                </button>
                                <button
                                    onClick={handleCurrentWeek}
                                    className="hidden md:block ml-2 px-3 py-1.5 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg uppercase tracking-wider transition-colors"
                                >
                                    Current
                                </button>
                            </div>
                        </div>
                    </div>
                </header>

                <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
                            <p className="text-gray-500 font-medium">Loading analytics...</p>
                        </div>
                    ) : (
                        <div className="space-y-8 animate-in fade-in duration-500">
                            
                            {/* KPI Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="card-base p-6 bg-gradient-to-br from-blue-500 to-blue-600 text-white border-0 shadow-md">
                                    <p className="text-blue-100 text-xs font-black uppercase tracking-widest mb-1">
                                        Actual Wages (Approved)
                                    </p>
                                    <p className="text-4xl font-bold tracking-tight">
                                        {formatCurrency(analyticsData.totalWages)}
                                    </p>
                                    <p className="text-blue-100 text-xs mt-2 font-medium">
                                        Budgeted: {formatCurrency(analyticsData.projectedWages)} (from roster)
                                    </p>
                                </div>

                                <div className="card-base p-6">
                                    <p className="text-gray-500 text-xs font-black uppercase tracking-widest mb-1">
                                        Total Hours
                                    </p>
                                    <div className="flex items-baseline gap-2">
                                        <p className="text-4xl font-bold text-gray-900 tracking-tight">
                                            {analyticsData.totalActualHours.toFixed(1)}<span className="text-xl text-gray-400 font-medium ml-1">hrs</span>
                                        </p>
                                    </div>
                                    <p className="text-gray-500 text-xs mt-2 font-medium">
                                        vs {analyticsData.totalScheduledHours.toFixed(1)} hrs scheduled
                                    </p>
                                </div>

                                <div className={`card-base p-6 border-l-4 ${analyticsData.laborVariance > 0 ? 'border-amber-500' : 'border-green-500'}`}>
                                    <p className="text-gray-500 text-xs font-black uppercase tracking-widest mb-1">
                                        Labor Variance
                                    </p>
                                    <p className={`text-4xl font-bold tracking-tight ${analyticsData.laborVariance > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                                        {analyticsData.laborVariance > 0 ? '+' : ''}{analyticsData.laborVariance.toFixed(1)}<span className="text-xl font-medium ml-1">hrs</span>
                                    </p>
                                    <p className="text-gray-500 text-xs mt-2 font-medium">
                                        {analyticsData.laborVariance > 0 
                                            ? "Staff worked more hours than rostered" 
                                            : "Staff worked fewer hours than rostered"}
                                    </p>
                                </div>
                            </div>

                            {/* Charts Row */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                
                                {/* Employee Cost Breakdown */}
                                <div className="card-base p-6 flex flex-col">
                                    <div className="mb-6">
                                        <h2 className="text-base font-black text-gray-900 uppercase tracking-widest">
                                            Cost: Budget vs Actual
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
                                                    formatter={(value: any, name: string) => [formatCurrency(Number(value)), name]}
                                                />
                                                <Legend verticalAlign="top" height={36}/>
                                                <Bar dataKey="rosterCost" name="Rostered" fill="#bfdbfe" radius={[4, 4, 0, 0]} maxBarSize={40} />
                                                <Bar dataKey="cost" name="Approved" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={40} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>

                                {/* Scheduled vs Actual Line Chart */}
                                <div className="card-base p-6 flex flex-col">
                                    <div className="mb-6">
                                        <h2 className="text-base font-black text-gray-900 uppercase tracking-widest">
                                            Rostered vs Worked Hours
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
                                                    formatter={(value: any) => [`${Number(value).toFixed(1)} hrs`, '']}
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
                </main>
            </div>
        </ProtectedRoute>
    );
}
