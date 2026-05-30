'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, Timestamp, getDocs } from 'firebase/firestore';
import { Timesheet, TimesheetStatus, User } from '@/types';
import { getWeekStart, formatDate, formatTimeTo12Hour } from '@/lib/utils';
import { updateTimesheetStatus, correctTimesheet } from '@/app/actions/timesheets';
import { useRouter, useSearchParams } from 'next/navigation';
import { useNotification } from '@/contexts/NotificationContext';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import AdminFilterBar from '@/components/admin/AdminFilterBar';
import AdminTabs from '@/components/admin/AdminTabs';
import AdminFormModal, { AdminModalFooter } from '@/components/admin/AdminFormModal';
import TimesheetTableRow from '@/components/admin/TimesheetTableRow';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import Icon from '@/components/ui/Icon';
import { AlertTriangle, Clock } from 'lucide-react';
import { Suspense } from 'react';

export default function AdminTimesheetsPage() {
    return (
        <Suspense fallback={<Spinner className="py-24" />}>
            <AdminTimesheetsContent />
        </Suspense>
    );
}

function AdminTimesheetsContent() {
    const { userData } = useAuth();
    const router = useRouter();
    const { showNotification } = useNotification();
    const [selectedWeek, setSelectedWeek] = useState<Date>(getWeekStart(new Date()));
    const [selectedDay, setSelectedDay] = useState<number>(-1); // Default to all week for clean grid/table
    const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
    const [staffMap, setStaffMap] = useState<Record<string, User>>({});
    const [loading, setLoading] = useState(true);
    const searchParams = useSearchParams();
    const [selectedStaffFilter, setSelectedStaffFilter] = useState<string>('ALL');
    const [showFlaggedOnly, setShowFlaggedOnly] = useState(false);
    const [statusFilter, setStatusFilter] = useState<'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL'>('PENDING');

    // Bulk selection state
    const [selectedTimesheetIds, setSelectedTimesheetIds] = useState<string[]>([]);

    useEffect(() => {
        const filter = searchParams.get('filter');
        if (filter === 'flagged') {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setShowFlaggedOnly(true);
            setStatusFilter('PENDING');
            setSelectedDay(-1);
        } else if (filter === 'pending') {
            setStatusFilter('PENDING');
            setSelectedDay(-1);
        }
    }, [searchParams]);

    // Adjustment Modal State
    const [showAdjustModal, setShowAdjustModal] = useState(false);
    const [selectedTimesheet, setSelectedTimesheet] = useState<Timesheet | null>(null);
    const [adjustStart, setAdjustStart] = useState('');
    const [adjustEnd, setAdjustEnd] = useState('');
    const [adminNote, setAdminNote] = useState('');
    const [voidTimesheet, setVoidTimesheet] = useState(false);

    useEffect(() => {
        const loadStaff = async () => {
            if (!userData || userData.role !== 'ADMIN') return;
            const snapshot = await getDocs(collection(db, 'users'));
            const map: Record<string, User> = {};
            snapshot.forEach((doc) => {
                map[doc.id] = { id: doc.id, ...doc.data() } as User;
            });
            setStaffMap(map);
        };

        if (userData?.role === 'ADMIN') {
            loadStaff();
        }
    }, [userData]);

    // Real-time timesheets loader
    useEffect(() => {
        if (!userData || userData.role !== 'ADMIN') return;

        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLoading(true);
        const weekStart = new Date(selectedWeek);
        const weekEnd = new Date(selectedWeek);
        weekEnd.setDate(weekEnd.getDate() + 7);

        let startDate = weekStart;
        let endDate = weekEnd;

        if (selectedDay !== -1) {
            const dayDate = new Date(selectedWeek);
            dayDate.setDate(dayDate.getDate() + (selectedDay === 0 ? 6 : selectedDay - 1));
            dayDate.setHours(0, 0, 0, 0);

            const nextDay = new Date(dayDate);
            nextDay.setDate(nextDay.getDate() + 1);

            startDate = dayDate;
            endDate = nextDay;
        }

        const timesheetsQuery = query(
            collection(db, 'timesheets'),
            where('date', '>=', Timestamp.fromDate(startDate)),
            where('date', '<', Timestamp.fromDate(endDate))
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

        return () => {
            unsubscribeTimesheets();
        };
    }, [selectedWeek, selectedDay, userData, showNotification]);



    const changeWeek = (direction: 'prev' | 'next') => {
        const newWeek = new Date(selectedWeek);
        newWeek.setDate(newWeek.getDate() + (direction === 'next' ? 7 : -7));
        setSelectedWeek(getWeekStart(newWeek));
        setSelectedTimesheetIds([]); // Reset selection on week change
    };

    const handleUpdateStatus = async (
        timesheetId: string,
        status: TimesheetStatus,
        workedStart?: string,
        workedEnd?: string,
        note?: string
    ) => {
        try {
            await updateTimesheetStatus(timesheetId, status, workedStart, workedEnd, note);
            showNotification(`Timesheet ${status.toLowerCase()} successfully`, 'success');
            setShowAdjustModal(false);
        } catch (error) {
            console.error('Error updating timesheet:', error);
            showNotification((error as Error).message || 'Failed to update timesheet', 'error');
        }
    };

    const openAdjustModal = (ts: Timesheet) => {
        setSelectedTimesheet(ts);
        setAdjustStart(ts.workedStart || ts.approvedShiftStart || '09:00');
        setAdjustEnd(ts.workedEnd || ts.approvedShiftEnd || '17:00');
        setAdminNote(ts.adminNote || '');
        setVoidTimesheet(false);
        setShowAdjustModal(true);
    };

    const staffOptions = Object.values(staffMap).map((s) => ({ id: s.id, name: s.name }));

    // Re-aggregate and map Timesheets
    const unifiedTimesheets = useMemo(() => {
        // Filter raw timesheets by staff and flagging constraints
        let filteredTs = selectedStaffFilter === 'ALL'
            ? timesheets
            : timesheets.filter((t) => t.staffId === selectedStaffFilter);

        if (showFlaggedOnly) {
            filteredTs = filteredTs.filter((t) => t.requiresAdminNote && t.status === 'PENDING');
        }

        // 1. Map actual timesheet submissions
        const resultList = filteredTs.map(ts => ({
            id: ts.id!,
            timesheet: ts,
            staffId: ts.staffId,
            date: ts.date.toDate(),
            status: ts.status,
            isMissed: false,
        }));

        // Filter by tab status
        let finalFiltered = resultList;
        if (statusFilter !== 'ALL') {
            finalFiltered = finalFiltered.filter(item => item.status === statusFilter);
        }

        // Sort by date then roster time
        return finalFiltered.sort((a, b) => {
            const dateDiff = a.date.getTime() - b.date.getTime();
            if (dateDiff !== 0) return dateDiff;
            return a.timesheet.approvedShiftStart.localeCompare(b.timesheet.approvedShiftStart);
        });
    }, [timesheets, selectedStaffFilter, statusFilter, showFlaggedOnly]);

    // Bulk approval actions
    const handleBulkApprove = async () => {
        if (selectedTimesheetIds.length === 0) return;

        // Collect timesheets matching selection that do NOT require admin notes
        const toApprove = unifiedTimesheets.filter(
            item => selectedTimesheetIds.includes(item.id) && !item.isMissed && !item.timesheet.requiresAdminNote
        );

        if (toApprove.length === 0) {
            showNotification('Only clean timesheets (no geofence/overtime flags) can be approved in bulk.', 'error');
            return;
        }

        try {
            await Promise.all(
                toApprove.map(item => updateTimesheetStatus(item.id, 'APPROVED'))
            );
            showNotification(`Bulk approved ${toApprove.length} timesheets successfully!`, 'success');
            setSelectedTimesheetIds([]);
        } catch (error) {
            console.error('Error in bulk approval:', error);
            showNotification('Failed to bulk approve timesheets.', 'error');
        }
    };

    const handleSelectToggle = (id: string) => {
        setSelectedTimesheetIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const handleSelectAll = (isChecked: boolean) => {
        if (isChecked) {
            // Select all PENDING timesheets that do NOT require admin notes
            const selectable = unifiedTimesheets
                .filter(item => !item.isMissed && !item.timesheet.requiresAdminNote)
                .map(item => item.id);
            setSelectedTimesheetIds(selectable);
        } else {
            setSelectedTimesheetIds([]);
        }
    };

    return (
        <>
            <div className="flex flex-col h-[calc(100vh-5.5rem)] lg:h-[calc(100vh-1.5rem)] min-h-0 overflow-hidden">
                {/* ── Static header, banners, and filter bars ── */}
            <div className="shrink-0">
                <AdminPageHeader
                    title="Timesheet Approvals"
                />

                {showFlaggedOnly && (
                    <div className="mb-5 p-3.5 bg-amber-50 border border-amber-100 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in">
                        <div className="flex items-start gap-3">
                            <Icon icon={AlertTriangle} size="md" className="text-amber-500 shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm font-medium text-amber-900">Flagged issues only</p>
                                <p className="text-xs text-amber-700 mt-0.5">
                                    Pending timesheets with geofence or overtime violations this week.
                                </p>
                            </div>
                        </div>
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                                setShowFlaggedOnly(false);
                                router.replace('/admin/timesheets');
                            }}
                        >
                            Clear filter
                        </Button>
                    </div>
                )}

                <AdminFilterBar
                    weekStart={selectedWeek}
                    onWeekPrev={() => changeWeek('prev')}
                    onWeekNext={() => changeWeek('next')}
                    selectedDay={selectedDay}
                    onDayChange={setSelectedDay}
                    staffValue={selectedStaffFilter}
                    onStaffChange={(id) => {
                        setSelectedStaffFilter(id);
                        setSelectedTimesheetIds([]);
                    }}
                    staffOptions={staffOptions}
                />

                {/* ── Status Tab Filter ── */}
                <div className="mb-4">
                    <AdminTabs
                        tabs={[
                            { id: 'PENDING', label: 'Pending', count: timesheets.filter(t => t.status === 'PENDING').length },
                            { id: 'APPROVED', label: 'Approved', count: timesheets.filter(t => t.status === 'APPROVED').length },
                            { id: 'REJECTED', label: 'Rejected', count: timesheets.filter(t => t.status === 'REJECTED').length },
                            { id: 'ALL', label: 'All Records', count: timesheets.length },
                        ]}
                        activeId={statusFilter}
                        onChange={(id) => {
                            setStatusFilter(id as 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL');
                            setSelectedTimesheetIds([]);
                        }}
                    />
                </div>
            </div>

            {/* ── Scrollable list section ── */}
            <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden pb-12 pr-0.5 flex flex-col">
                {/* ── Desktop Table Layout ── */}
                <div className="hidden lg:flex flex-col flex-1 min-h-0 w-full rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
                    {loading ? (
                        <Spinner className="py-24" />
                    ) : unifiedTimesheets.length === 0 ? (
                        <div className="py-24 text-center">
                            <EmptyState title="No timesheets" description="No timesheets match the active filters." icon={Clock} />
                        </div>
                    ) : (
                        <div className="overflow-auto flex-1 min-h-0">
                            <table className="w-full text-left border-collapse">
                                <thead className="sticky top-0 bg-gray-50 z-20">
                                    <tr className="border-b border-gray-100 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                        <th className="px-5 py-3.5 w-12 bg-gray-50">
                                            {statusFilter === 'PENDING' && (
                                                <input
                                                    type="checkbox"
                                                    onChange={(e) => handleSelectAll(e.target.checked)}
                                                    className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-400 focus:ring-offset-0 cursor-pointer"
                                                />
                                            )}
                                        </th>
                                        <th className="px-5 py-3.5 bg-gray-50">Employee</th>
                                        <th className="px-5 py-3.5 bg-gray-50">Date</th>
                                        <th className="px-5 py-3.5 bg-gray-50">Rostered Shift</th>
                                        <th className="px-5 py-3.5 bg-gray-50">Clocked Time</th>
                                        <th className="px-5 py-3.5 bg-gray-50">Payable</th>
                                        <th className="px-5 py-3.5 text-right bg-gray-50">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {unifiedTimesheets.map((item) => (
                                        <TimesheetTableRow
                                            key={item.id}
                                            timesheet={item.timesheet}
                                            staffName={staffMap[item.staffId]?.name || 'Staff member'}
                                            isSelected={selectedTimesheetIds.includes(item.id)}
                                            onSelectToggle={() => handleSelectToggle(item.id)}
                                            onQuickApprove={() => handleUpdateStatus(item.id, 'APPROVED')}
                                            onReview={() => openAdjustModal(item.timesheet)}
                                            onReject={() => handleUpdateStatus(item.id, 'REJECTED')}
                                        />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* ── Mobile/Tablet List Layout (Clean SaaS List) ── */}
                <div className="lg:hidden flex-1 overflow-y-auto">
                    {loading ? (
                        <Spinner className="py-16" />
                    ) : unifiedTimesheets.length === 0 ? (
                        <EmptyState title="No timesheets" description="No timesheets match the active filters." icon={Clock} />
                    ) : (
                        <div className="bg-white border border-gray-100 rounded-2xl divide-y divide-gray-50 shadow-sm overflow-hidden">
                            {unifiedTimesheets.map((item) => (
                                <div key={item.id} className="p-4 flex flex-col gap-3 hover:bg-gray-50/30 transition-colors">
                                    <div className="flex items-center justify-between">
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-sm font-medium text-gray-900">
                                                {staffMap[item.staffId]?.name || 'Staff member'}
                                            </span>
                                            <span className="text-xs text-gray-400">
                                                {formatDate(item.date)}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3 text-xs">
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-gray-400 font-medium uppercase tracking-wider text-[10px]">Roster</span>
                                            <span className="text-gray-600">
                                                {item.timesheet.approvedShiftStart ? `${formatTimeTo12Hour(item.timesheet.approvedShiftStart)}–${formatTimeTo12Hour(item.timesheet.approvedShiftEnd)}` : 'Unscheduled'}
                                            </span>
                                        </div>
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-gray-400 font-medium uppercase tracking-wider text-[10px]">Clocked</span>
                                            <span className={`${!item.timesheet.workedStart ? 'text-amber-600' : 'text-gray-800'}`}>
                                                {item.timesheet.workedStart ? `${formatTimeTo12Hour(item.timesheet.workedStart)}–${formatTimeTo12Hour(item.timesheet.workedEnd)}` : 'No clock-in'}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex justify-end gap-2 pt-2.5 border-t border-gray-100">
                                        <button
                                            onClick={() => openAdjustModal(item.timesheet)}
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                                        >
                                            Review
                                        </button>
                                        {item.status === 'PENDING' && !item.timesheet.requiresAdminNote && item.timesheet.workedStart && (
                                            <button
                                                onClick={() => handleUpdateStatus(item.id, 'APPROVED')}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                                            >
                                                Approve
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>

            {/* ── Adjustment Modal ── */}
            <AdminFormModal
                open={showAdjustModal && !!selectedTimesheet}
                onClose={() => setShowAdjustModal(false)}
                title={
                    selectedTimesheet?.requiresAdminNote && selectedTimesheet.status === 'PENDING'
                        ? 'Resolve timesheet'
                        : 'Adjust worked time'
                }
                description={
                    selectedTimesheet?.requiresAdminNote
                        ? 'Admin note required before approval.'
                        : undefined
                }
                footer={
                    selectedTimesheet ? (
                        <AdminModalFooter
                            onCancel={() => setShowAdjustModal(false)}
                            onPrimary={async () => {
                                if (selectedTimesheet.status === 'APPROVED') {
                                    if (!adminNote.trim()) {
                                        showNotification('Admin note is required to explain this correction', 'error');
                                        return;
                                    }
                                    try {
                                        const finalStatus = voidTimesheet ? 'REJECTED' : 'APPROVED';
                                        await correctTimesheet(selectedTimesheet.id!, adjustStart, adjustEnd, adminNote, finalStatus);
                                        showNotification(
                                            voidTimesheet ? 'Timesheet voided and rejected successfully' : 'Timesheet corrected successfully',
                                            'success'
                                        );
                                        setShowAdjustModal(false);
                                    } catch (error) {
                                        console.error('Error correcting timesheet:', error);
                                        showNotification((error as Error).message || 'Failed to update timesheet', 'error');
                                    }
                                } else {
                                    if (selectedTimesheet.requiresAdminNote && !adminNote.trim()) {
                                        showNotification('Admin note is required to resolve this record', 'error');
                                        return;
                                    }
                                    handleUpdateStatus(selectedTimesheet.id!, 'APPROVED', adjustStart, adjustEnd, adminNote);
                                }
                            }}
                            primaryLabel={
                                selectedTimesheet.status === 'APPROVED'
                                    ? (voidTimesheet ? 'Void & Reject' : 'Apply Correction')
                                    : (selectedTimesheet.requiresAdminNote ? 'Resolve & approve' : 'Approve adjusted')
                            }
                        />
                    ) : undefined
                }
            >
                {selectedTimesheet && (
                    <>
                        {selectedTimesheet.status === 'APPROVED' && (
                            <div className="mb-4">
                                <label className="flex items-center gap-2.5 cursor-pointer text-xs font-semibold text-red-700 bg-red-50/50 border border-red-200/30 p-3 rounded-lg select-none">
                                    <input
                                        type="checkbox"
                                        checked={voidTimesheet}
                                        onChange={(e) => setVoidTimesheet(e.target.checked)}
                                        className="w-4 h-4 rounded border-slate-300 text-red-600 focus:ring-red-500 focus:ring-offset-0 cursor-pointer"
                                    />
                                    <span>Void / Reject this approved timesheet (will mark it as REJECTED)</span>
                                </label>
                            </div>
                        )}

                        <div className="mb-4 p-4 bg-gray-50 border border-gray-100 rounded-xl grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <p className="text-label">Roster</p>
                                <p className="font-semibold tabular-nums mt-0.5">
                                    {selectedTimesheet.approvedShiftStart ? `${formatTimeTo12Hour(selectedTimesheet.approvedShiftStart)} – ${formatTimeTo12Hour(selectedTimesheet.approvedShiftEnd)}` : 'Unscheduled'}
                                </p>
                            </div>
                            <div>
                                <p className="text-label">Submitted</p>
                                <p className="font-semibold tabular-nums mt-0.5">
                                    {selectedTimesheet.workedStart ? `${formatTimeTo12Hour(selectedTimesheet.workedStart)} – ${formatTimeTo12Hour(selectedTimesheet.workedEnd)}` : 'No clock-in'}
                                </p>
                            </div>
                        </div>

                        {!voidTimesheet && (
                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label className="text-label block mb-1">Adjusted start</label>
                                    <Input type="time" value={adjustStart} onChange={(e) => setAdjustStart(e.target.value)} />
                                </div>
                                <div>
                                    <label className="text-label block mb-1">Adjusted end</label>
                                    <Input type="time" value={adjustEnd} onChange={(e) => setAdjustEnd(e.target.value)} />
                                </div>
                            </div>
                        )}

                        <div>
                            <label className="text-label block mb-1">
                                Admin note {(selectedTimesheet.requiresAdminNote || selectedTimesheet.status === 'APPROVED') && <span className="text-red-500">*</span>}
                            </label>
                            <textarea
                                value={adminNote}
                                onChange={(e) => setAdminNote(e.target.value)}
                                placeholder={
                                    selectedTimesheet.status === 'APPROVED'
                                        ? (voidTimesheet ? "Reason for voiding/rejecting this approved timesheet..." : "Reason for correcting this approved timesheet...")
                                        : "Reason for approval or adjustment..."
                                }
                                className="input-base min-h-[88px] resize-none w-full text-sm"
                            />
                        </div>
                    </>
                )}
            </AdminFormModal>

            {/* ── Floating Sticky Bulk Action Bar ── */}
            {statusFilter === 'PENDING' && selectedTimesheetIds.length > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white border border-gray-200 text-gray-900 rounded-full px-5 py-2.5 shadow-xl flex items-center gap-5 z-50 animate-in fade-in slide-in-from-bottom-4">
                    <span className="text-xs font-medium text-gray-400 whitespace-nowrap">
                        <strong className="text-gray-800 font-semibold">{selectedTimesheetIds.length}</strong> selected
                    </span>
                    <div className="w-px h-4 bg-gray-100" />
                    <button
                        onClick={handleBulkApprove}
                        className="inline-flex items-center justify-center text-emerald-600 border border-emerald-300 text-xs font-medium px-4 py-1.5 rounded-full hover:bg-emerald-50 transition-all cursor-pointer"
                    >
                        Approve Selected
                    </button>
                </div>
            )}
        </>
    );
}
