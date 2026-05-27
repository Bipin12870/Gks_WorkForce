'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, Timestamp, getDocs } from 'firebase/firestore';
import { Shift, Timesheet, TimesheetStatus, User } from '@/types';
import { getWeekStart, getDayName } from '@/lib/utils';
import { updateTimesheetStatus } from '@/app/actions/timesheets';
import { useRouter, useSearchParams } from 'next/navigation';
import { useNotification } from '@/contexts/NotificationContext';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import AdminFilterBar from '@/components/admin/AdminFilterBar';
import AdminTabs from '@/components/admin/AdminTabs';
import AdminFormModal, { AdminModalFooter } from '@/components/admin/AdminFormModal';
import TimesheetApprovalCard from '@/components/admin/TimesheetApprovalCard';
import RosterShiftCard from '@/components/admin/RosterShiftCard';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import Icon from '@/components/ui/Icon';
import { AlertTriangle, Calendar } from 'lucide-react';
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
    const [selectedDay, setSelectedDay] = useState<number>(new Date().getDay());
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
    const [staffMap, setStaffMap] = useState<Record<string, User>>({});
    const [loading, setLoading] = useState(true);
    const searchParams = useSearchParams();
    const [selectedStaffFilter, setSelectedStaffFilter] = useState<string>('ALL');
    const [filterMode, setFilterMode] = useState<'HARD' | 'HIGHLIGHT'>('HARD');
    const [activeMobileTab, setActiveMobileTab] = useState<'roster' | 'timesheets'>('roster');
    const [showFlaggedOnly, setShowFlaggedOnly] = useState(false);
    const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');

    useEffect(() => {
        const filter = searchParams.get('filter');
        if (filter === 'flagged') {
            setShowFlaggedOnly(true);
            setStatusFilter('PENDING');
            setSelectedDay(-1); // Show all days for the week
            setActiveMobileTab('timesheets');
        } else if (filter === 'pending') {
            setStatusFilter('PENDING');
            setSelectedDay(-1); // Show all days for the week
            setActiveMobileTab('timesheets');
        }
    }, [searchParams]);

    // Adjustment Modal State
    const [showAdjustModal, setShowAdjustModal] = useState(false);
    const [selectedTimesheet, setSelectedTimesheet] = useState<Timesheet | null>(null);
    const [adjustStart, setAdjustStart] = useState('');
    const [adjustEnd, setAdjustEnd] = useState('');
    const [adminNote, setAdminNote] = useState('');

    useEffect(() => {
        if (userData?.role === 'ADMIN') {
            loadStaff();
        }
    }, [userData]);

    useEffect(() => {
        if (!userData || userData.role !== 'ADMIN') return;

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

        const shiftsQuery = query(
            collection(db, 'shifts'),
            where('status', '==', 'APPROVED'),
            where('date', '>=', Timestamp.fromDate(startDate)),
            where('date', '<', Timestamp.fromDate(endDate))
        );

        const unsubscribeShifts = onSnapshot(shiftsQuery,
            (snapshot) => {
                const loadedShifts: Shift[] = [];
                snapshot.forEach((doc) => {
                    loadedShifts.push({ id: doc.id, ...doc.data() } as Shift);
                });
                loadedShifts.sort((a, b) => a.startTime.localeCompare(b.startTime));
                setShifts(loadedShifts);
            },
            (error) => {
                console.error('Error fetching shifts:', error);
                showNotification('Failed to load rostered shifts.', 'error');
            }
        );

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
            unsubscribeShifts();
            unsubscribeTimesheets();
        };
    }, [selectedWeek, selectedDay, userData]);

    const loadStaff = async () => {
        if (!userData || userData.role !== 'ADMIN') return;
        const snapshot = await getDocs(collection(db, 'users'));
        const map: Record<string, User> = {};
        snapshot.forEach((doc) => {
            map[doc.id] = { id: doc.id, ...doc.data() } as User;
        });
        setStaffMap(map);
    };

    const changeWeek = (direction: 'prev' | 'next') => {
        const newWeek = new Date(selectedWeek);
        newWeek.setDate(newWeek.getDate() + (direction === 'next' ? 7 : -7));
        setSelectedWeek(getWeekStart(newWeek));
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
        setAdjustStart(ts.workedStart);
        setAdjustEnd(ts.workedEnd);
        setAdminNote(ts.adminNote || '');
        setShowAdjustModal(true);
    };

    const staffOptions = Object.values(staffMap).map((s) => ({ id: s.id, name: s.name }));

    const getFilteredTimesheets = () => {
        let list = selectedStaffFilter === 'ALL' ? timesheets : timesheets.filter((t) => t.staffId === selectedStaffFilter);
        if (statusFilter !== 'ALL') list = list.filter((t) => t.status === statusFilter);
        if (showFlaggedOnly) list = list.filter((t) => t.requiresAdminNote && t.status === 'PENDING');
        return list;
    };

    const renderRosteredShifts = () => (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <h3 className="text-section-title">
                    Roster · {selectedDay === -1 ? 'Full week' : getDayName(selectedDay)}
                </h3>
                <span className="text-label">Read-only</span>
            </div>
            {loading ? (
                <Spinner className="py-10" />
            ) : (() => {
                // If All Week is selected (-1), we force hard filter for clarity
                const shouldHardFilter = filterMode === 'HARD' || selectedDay === -1;
                const rosterShifts = shouldHardFilter && selectedStaffFilter !== 'ALL'
                    ? shifts.filter(s => s.staffId === selectedStaffFilter)
                    : shifts;

                return rosterShifts.length === 0 ? (
                    <EmptyState title="No shifts" description="No approved shifts match these filters." icon={Calendar} />
                ) : (
                    rosterShifts.map((shift) => (
                        <RosterShiftCard
                            key={shift.id}
                            shift={shift}
                            staffName={staffMap[shift.staffId]?.name || 'Unknown'}
                            showDayBadge={selectedDay === -1}
                            highlighted={selectedStaffFilter === shift.staffId}
                            onSelect={
                                selectedDay === -1
                                    ? () => {
                                          if (selectedStaffFilter === 'ALL') {
                                              setSelectedStaffFilter(shift.staffId);
                                              setFilterMode('HIGHLIGHT');
                                          } else if (filterMode === 'HIGHLIGHT' && selectedStaffFilter === shift.staffId) {
                                              setSelectedStaffFilter('ALL');
                                          }
                                      }
                                    : undefined
                            }
                        />
                    ))
                );
            })()}
        </div>
    );

    const renderSubmittedTimesheets = () => {
        const filteredTimesheets = getFilteredTimesheets();
        return (
        <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-gray-100">
                <div>
                    <h3 className="text-section-title text-blue-700">
                        {statusFilter === 'ALL' ? 'Timesheets' : statusFilter.charAt(0) + statusFilter.slice(1).toLowerCase()}
                    </h3>
                    <p className="text-label">{statusFilter === 'PENDING' ? 'Action required' : 'Review & archive'}</p>
                </div>
                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                    className="input-base py-2 min-h-10 w-full sm:w-40"
                >
                    <option value="ALL">All statuses</option>
                    <option value="PENDING">Pending</option>
                    <option value="APPROVED">Approved</option>
                    <option value="REJECTED">Rejected</option>
                </select>
            </div>
            {loading ? (
                <Spinner className="py-10" />
            ) : filteredTimesheets.length === 0 ? (
                <EmptyState title="No timesheets" description="Nothing submitted for these filters." icon={AlertTriangle} />
            ) : (
                filteredTimesheets.map((ts) => (
                    <TimesheetApprovalCard
                        key={ts.id}
                        timesheet={ts}
                        staffName={staffMap[ts.staffId]?.name || 'Staff'}
                        onQuickApprove={() => handleUpdateStatus(ts.id!, 'APPROVED')}
                        onReview={() => openAdjustModal(ts)}
                        onAdjust={() => openAdjustModal(ts)}
                        onReject={() => handleUpdateStatus(ts.id!, 'REJECTED')}
                    />
                ))
            )}
        </div>
        );
    };

    return (
        <>
            <AdminPageHeader
                title="Timesheet approval"
                description="Review worked hours, automation flags, and approve or adjust before payroll."
            />

            {showFlaggedOnly && (
                <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                        <Icon icon={AlertTriangle} size="md" className="text-amber-600 shrink-0 mt-0.5" />
                        <div>
                            <p className="text-sm font-semibold text-amber-900">Flagged issues only</p>
                            <p className="text-label text-amber-800">
                                Pending timesheets with geofence or overtime violations this week.
                            </p>
                        </div>
                    </div>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                            setShowFlaggedOnly(false);
                            setSelectedDay(new Date().getDay());
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
                    setFilterMode('HARD');
                }}
                staffOptions={staffOptions}
            />

            <div className="hidden lg:grid lg:grid-cols-2 gap-8">
                        {renderRosteredShifts()}
                        {renderSubmittedTimesheets()}
                    </div>

            <div className="lg:hidden admin-section-card">
                <AdminTabs
                    tabs={[
                        { id: 'roster', label: 'Roster', count: shifts.length },
                        { id: 'timesheets', label: 'Timesheets', count: getFilteredTimesheets().length },
                    ]}
                    activeId={activeMobileTab}
                    onChange={(id) => setActiveMobileTab(id as 'roster' | 'timesheets')}
                />
                <div className="p-4 min-h-[320px]">
                    {activeMobileTab === 'roster' ? renderRosteredShifts() : renderSubmittedTimesheets()}
                </div>
            </div>

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
                            onPrimary={() => {
                                if (selectedTimesheet.requiresAdminNote && !adminNote.trim()) {
                                    showNotification('Admin note is required to resolve this record', 'error');
                                    return;
                                }
                                handleUpdateStatus(selectedTimesheet.id!, 'APPROVED', adjustStart, adjustEnd, adminNote);
                            }}
                            primaryLabel={
                                selectedTimesheet.requiresAdminNote && selectedTimesheet.status === 'PENDING'
                                    ? 'Resolve & approve'
                                    : 'Approve adjusted'
                            }
                        />
                    ) : undefined
                }
            >
                {selectedTimesheet && (
                    <>
                        <div className="mb-4 p-4 bg-gray-50 border border-gray-100 rounded-xl grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <p className="text-label">Roster</p>
                                <p className="font-semibold tabular-nums mt-0.5">
                                    {selectedTimesheet.approvedShiftStart} – {selectedTimesheet.approvedShiftEnd}
                                </p>
                            </div>
                            <div>
                                <p className="text-label">Submitted</p>
                                <p className="font-semibold tabular-nums mt-0.5">
                                    {selectedTimesheet.workedStart} – {selectedTimesheet.workedEnd}
                                </p>
                            </div>
                        </div>
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
                        {(selectedTimesheet.requiresAdminNote || adminNote) && (
                            <div>
                                <label className="text-label block mb-1">
                                    Admin note {selectedTimesheet.requiresAdminNote && <span className="text-red-600">*</span>}
                                </label>
                                <textarea
                                    value={adminNote}
                                    onChange={(e) => setAdminNote(e.target.value)}
                                    placeholder="Reason for approval…"
                                    className="input-base min-h-[88px] resize-none w-full"
                                />
                            </div>
                        )}
                    </>
                )}
            </AdminFormModal>
        </>
    );
}
