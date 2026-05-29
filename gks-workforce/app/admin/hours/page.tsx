'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { User, Timesheet } from '@/types';
import { getWeekStart, calculatePayrollRecord, formatHoursAndMinutes } from '@/lib/utils';
import { useNotification } from '@/contexts/NotificationContext';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import AdminWeekPicker from '@/components/admin/AdminWeekPicker';
import AdminStatCard from '@/components/admin/AdminStatCard';
import AdminDataTable, {
    AdminTableHead,
    AdminTableTh,
    AdminTableBody,
    AdminTableRow,
    AdminTableTd,
} from '@/components/admin/AdminDataTable';
import Badge from '@/components/ui/Badge';
import Spinner from '@/components/ui/Spinner';
import { Clock, DollarSign } from 'lucide-react';

export default function AdminHoursPage() {
    const [selectedWeek, setSelectedWeek] = useState<Date>(getWeekStart(new Date()));
    const [staffHours, setStaffHours] = useState<Record<string, { hours: number; pay: number }>>({});
    const [staffMap, setStaffMap] = useState<Record<string, User>>({});
    const [loading, setLoading] = useState(true);
    const { showNotification } = useNotification();

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);

            try {
                const staffSnapshot = await getDocs(collection(db, 'users'));
                const map: Record<string, User> = {};
                staffSnapshot.forEach((docSnap) => {
                    const data = docSnap.data();
                    if (data.role === 'STAFF') {
                        map[docSnap.id] = { id: docSnap.id, ...data } as User;
                    }
                });
                setStaffMap(map);

                const weekStart = new Date(selectedWeek);
                const timesheetsQ = query(
                    collection(db, 'timesheets'),
                    where('weekStartDate', '==', Timestamp.fromDate(weekStart)),
                    where('status', '==', 'APPROVED')
                );
                const timesheetsSnapshot = await getDocs(timesheetsQ);
                const hours: Record<string, { hours: number; pay: number }> = {};

                timesheetsSnapshot.forEach((docSnap) => {
                    const ts = docSnap.data() as Timesheet;
                    if (!hours[ts.staffId]) {
                        hours[ts.staffId] = { hours: 0, pay: 0 };
                    }
                    const payroll = calculatePayrollRecord(ts.workedStart, ts.workedEnd);
                    const durationHours = payroll.payableMinutes / 60;
                    const hourlyRate = map[ts.staffId]?.hourlyRate || 0;
                    hours[ts.staffId].hours += durationHours;
                    hours[ts.staffId].pay += durationHours * hourlyRate;
                });

                setStaffHours(hours);
            } catch (error: unknown) {
                console.error('Error loading hours data:', error);
                showNotification('Failed to load hours data. Please try again.', 'error');
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [selectedWeek, showNotification]);

    const changeWeek = (direction: 'prev' | 'next') => {
        const newWeek = new Date(selectedWeek);
        newWeek.setDate(newWeek.getDate() + (direction === 'next' ? 7 : -7));
        setSelectedWeek(getWeekStart(newWeek));
    };

    const totalHours = Object.values(staffHours).reduce((sum, data) => sum + data.hours, 0);
    const totalPay = Object.values(staffHours).reduce((sum, data) => sum + data.pay, 0);
    const staffRows = Object.entries(staffMap).sort(
        (a, b) => (staffHours[b[0]]?.hours ?? 0) - (staffHours[a[0]]?.hours ?? 0)
    );

    return (
        <>
            <AdminPageHeader
                title="Hours & payroll"
                description="Approved timesheet hours and estimated gross labor for the selected week."
            />

            <div className="admin-toolbar mb-6">
                <AdminWeekPicker weekStart={selectedWeek} onPrev={() => changeWeek('prev')} onNext={() => changeWeek('next')} />
                <Badge variant="success">Approved timesheets only</Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <AdminStatCard
                    label="Total payable hours"
                    value={formatHoursAndMinutes(totalHours)}
                    icon={Clock}
                />
                <AdminStatCard
                    label="Gross labor cost"
                    value={`$${totalPay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    icon={DollarSign}
                    variant="success"
                />
            </div>

            <div className="admin-section-card">
                <div className="admin-section-card-header">
                    <h2 className="text-section-title">Payroll by staff</h2>
                </div>
                {loading ? (
                    <Spinner className="py-16" />
                ) : (
                    <AdminDataTable
                        isEmpty={Object.keys(staffMap).length === 0}
                        emptyMessage="No active staff members found"
                    >
                        <AdminTableHead>
                            <AdminTableTh>Staff</AdminTableTh>
                            <AdminTableTh>Rate</AdminTableTh>
                            <AdminTableTh>Hours</AdminTableTh>
                            <AdminTableTh align="right">Est. pay</AdminTableTh>
                        </AdminTableHead>
                        <AdminTableBody>
                            {staffRows.map(([staffId, staff]) => {
                                const hours = staffHours[staffId]?.hours || 0;
                                const pay = staffHours[staffId]?.pay || 0;
                                return (
                                    <AdminTableRow key={staffId}>
                                        <AdminTableTd>
                                            <span className="font-semibold">{staff.name}</span>
                                        </AdminTableTd>
                                        <AdminTableTd>
                                            <span className="text-gray-500 tabular-nums">${staff.hourlyRate.toFixed(2)}/hr</span>
                                        </AdminTableTd>
                                        <AdminTableTd>
                                            <span className="font-medium tabular-nums">{formatHoursAndMinutes(hours)}</span>
                                        </AdminTableTd>
                                        <AdminTableTd align="right">
                                            <span className="font-semibold text-green-700 tabular-nums">
                                                ${pay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </span>
                                        </AdminTableTd>
                                    </AdminTableRow>
                                );
                            })}
                        </AdminTableBody>
                    </AdminDataTable>
                )}
            </div>
        </>
    );
}
