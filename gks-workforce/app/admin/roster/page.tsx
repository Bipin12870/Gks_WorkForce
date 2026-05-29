'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import {
    collection,
    query,
    where,
    onSnapshot,
    getDocs,
    Timestamp,
} from 'firebase/firestore';
import { Availability, Shift, User, TimeRange } from '@/types';
import { getWeekStart, getDayName, isWithinAvailability } from '@/lib/utils';
import { createShift, updateShift, deleteShift } from '@/app/actions/shifts';
import { useNotification } from '@/contexts/NotificationContext';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import AdminFilterBar from '@/components/admin/AdminFilterBar';
import AdminTabs from '@/components/admin/AdminTabs';
import AdminFormModal from '@/components/admin/AdminFormModal';
import RosterShiftCard from '@/components/admin/RosterShiftCard';
import AvailabilityCard from '@/components/admin/AvailabilityCard';
import RosterWeeklyGrid from '@/components/admin/RosterWeeklyGrid';
import Badge from '@/components/ui/Badge';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { CalendarDays, LayoutList, AlertTriangle, Calendar } from 'lucide-react';

export default function AdminRosterPage() {
    const { userData } = useAuth();
    const { showNotification } = useNotification();
    const [selectedWeek, setSelectedWeek] = useState<Date>(getWeekStart(new Date()));
    const [selectedDay, setSelectedDay] = useState<number>(new Date().getDay());
    const [availability, setAvailability] = useState<Availability[]>([]);
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [staffMap, setStaffMap] = useState<Record<string, User>>({});
    const [staffList, setStaffList] = useState<User[]>([]);
    const [showApprovalModal, setShowApprovalModal] = useState(false);
    const [selectedStaff, setSelectedStaff] = useState<{ id: string; name: string; ranges: TimeRange[]; dayOfWeek?: number } | null>(null);
    const [shiftForm, setShiftForm] = useState({ startTime: '09:00', endTime: '17:00' });
    const [isEditingShift, setIsEditingShift] = useState(false);
    const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
    const [activeMobileTab, setActiveMobileTab] = useState<'roster' | 'availability'>('roster');
    const [staffFilter, setStaffFilter] = useState<string | null>(null);
    const [filterMode, setFilterMode] = useState<'HARD' | 'HIGHLIGHT'>('HARD');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [forceOverride, setForceOverride] = useState(false);

    // Load staff data
    useEffect(() => {
        let isMounted = true;

        const loadStaff = async () => {
            if (!userData || userData.role !== 'ADMIN') return;
            const snapshot = await getDocs(collection(db, 'users'));
            const map: Record<string, User> = {};
            const list: User[] = [];
            snapshot.forEach((doc) => {
                const u = { id: doc.id, ...doc.data() } as User;
                if (u.isActive !== false) {
                    map[doc.id] = u;
                    list.push(u);
                }
            });
            
            if (isMounted) {
                setStaffMap(map);
                setStaffList(list.sort((a, b) => a.name.localeCompare(b.name)));
            }
        };

        if (userData?.role === 'ADMIN') {
            loadStaff();
        }

        return () => {
            isMounted = false;
        };
    }, [userData]);

    // Real-time listener for availability
    useEffect(() => {
        if (!userData || userData.role !== 'ADMIN') return;

        const weekStart = Timestamp.fromDate(selectedWeek);
        const q = query(
            collection(db, 'availability'),
            where('weekStartDate', '==', weekStart),
            where('status', '==', 'SUBMITTED')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const loadedAvailability: Availability[] = [];
            snapshot.forEach((doc) => {
                loadedAvailability.push({ id: doc.id, ...doc.data() } as Availability);
            });
            setAvailability(loadedAvailability);
        });

        return () => unsubscribe();
    }, [selectedWeek, userData]);

    // Real-time listener for shifts (full week for timeline; filtered by day for list)
    useEffect(() => {
        if (!userData || userData.role !== 'ADMIN') return;

        const weekStart = new Date(selectedWeek);
        const weekEnd = new Date(selectedWeek);
        weekEnd.setDate(weekEnd.getDate() + 7);

        // Grid view always loads the full week; list view filters by day
        let startDate = weekStart;
        let endDate = weekEnd;

        if (viewMode === 'list' && selectedDay !== -1) {
            const dayDate = new Date(selectedWeek);
            dayDate.setDate(dayDate.getDate() + (selectedDay === 0 ? 6 : selectedDay - 1));
            dayDate.setHours(0, 0, 0, 0);
            const nextDay = new Date(dayDate);
            nextDay.setDate(nextDay.getDate() + 1);
            startDate = dayDate;
            endDate = nextDay;
        }

        const q = query(
            collection(db, 'shifts'),
            where('date', '>=', Timestamp.fromDate(startDate)),
            where('date', '<', Timestamp.fromDate(endDate)),
            where('status', '==', 'APPROVED')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const loadedShifts: Shift[] = [];
            snapshot.forEach((doc) => {
                loadedShifts.push({ id: doc.id, ...doc.data() } as Shift);
            });
            setShifts(loadedShifts);
        });

        return () => unsubscribe();
    }, [selectedWeek, selectedDay, userData, viewMode]);



    const changeWeek = (direction: 'prev' | 'next') => {
        const newWeek = new Date(selectedWeek);
        newWeek.setDate(newWeek.getDate() + (direction === 'next' ? 7 : -7));
        setSelectedWeek(getWeekStart(newWeek));
    };

    // ── Availability helpers ──────────────────────────────────────────────────
    const getAvailabilityForDay = () => {
        let filtered = availability;
        if (selectedDay !== -1) {
            filtered = filtered.filter((a) => a.dayOfWeek === selectedDay);
        }
        if (staffFilter) {
            filtered = filtered.filter((a) => a.staffId === staffFilter);
        }
        return filtered;
    };

    // ── List-view modal openers ───────────────────────────────────────────────
    const openApprovalModal = (staffId: string, ranges: TimeRange[], dayOfWeek?: number) => {
        const staff = staffMap[staffId];
        if (!staff) return;
        setSelectedStaff({ id: staffId, name: staff.name, ranges, dayOfWeek });
        setShiftForm({ startTime: ranges[0]?.start || '09:00', endTime: ranges[0]?.end || '17:00' });
        setIsEditingShift(false);
        setEditingShiftId(null);
        setForceOverride(false);
        setShowApprovalModal(true);
    };

    const openEditModal = (shift: Shift) => {
        const staff = staffMap[shift.staffId];
        if (!staff) return;
        const shiftDay = shift.date.toDate().getDay();
        const staffAvail = availability.find(
            (a) => a.staffId === shift.staffId && a.dayOfWeek === shiftDay
        );
        const ranges = staffAvail?.timeRanges ?? [];
        setSelectedStaff({ id: shift.staffId, name: staff.name, ranges, dayOfWeek: shiftDay });
        setShiftForm({ startTime: shift.startTime, endTime: shift.endTime });
        setIsEditingShift(true);
        setEditingShiftId(shift.id!);
        setForceOverride(false);
        setShowApprovalModal(true);
    };

    // ── Save (list-view modal) ────────────────────────────────────────────────
    const handleSaveShift = async () => {
        if (!selectedStaff || !userData) return;
        try {
            if (isEditingShift && editingShiftId) {
                await updateShift(editingShiftId, {
                    startTime: shiftForm.startTime,
                    endTime: shiftForm.endTime,
                    forceOverride,
                });
                showNotification('Shift updated successfully!', 'success');
            } else {
                const dayDate = new Date(selectedWeek);
                const shiftDay = selectedStaff.dayOfWeek ?? selectedDay;
                const finalDay = shiftDay === -1 ? new Date().getDay() : shiftDay;
                dayDate.setDate(dayDate.getDate() + (finalDay === 0 ? 6 : finalDay - 1));
                dayDate.setHours(0, 0, 0, 0);
                await createShift({
                    staffId: selectedStaff.id,
                    dateMs: dayDate.getTime(),
                    startTime: shiftForm.startTime,
                    endTime: shiftForm.endTime,
                    forceOverride,
                    timezoneOffset: new Date().getTimezoneOffset(),
                });
                showNotification('Shift approved successfully!', 'success');
            }
            setShowApprovalModal(false);
            setSelectedStaff(null);
            setIsEditingShift(false);
            setEditingShiftId(null);
            setForceOverride(false);
        } catch (error) {
            console.error('Error saving shift:', error);
            showNotification((error as Error).message || 'Failed to save shift. Please try again.', 'error');
        }
    };

    const handleRemoveShift = async (shiftId: string) => {
        const shift = shifts.find((s) => s.id === shiftId);
        if (!window.confirm(`Remove ${staffMap[shift?.staffId ?? '']?.name || 'this staff'} from this shift?`)) return;
        try {
            await deleteShift(shiftId);
            showNotification('Shift removed successfully', 'success');
        } catch (error) {
            console.error('Error removing shift:', error);
            showNotification((error as Error).message || 'Failed to remove shift', 'error');
        }
    };

    const handleGridCellClick = (staffId: string, dayOfWeek: number, existingShift?: Shift) => {
        if (existingShift) {
            openEditModal(existingShift);
        } else {
            const staffAvail = availability.find(
                (a) => a.staffId === staffId && a.dayOfWeek === dayOfWeek
            );
            const ranges = staffAvail?.timeRanges ?? [];
            openApprovalModal(staffId, ranges, dayOfWeek);
        }
    };

    const dayAvailability = getAvailabilityForDay();
    const staffOptions = Object.values(staffMap).map((s) => ({ id: s.id, name: s.name }));

    return (
        <>
            <AdminPageHeader
                title="Roster & availability"
                description="Approve shifts against submitted availability for the selected week and day."
            />

            <AdminFilterBar
                weekStart={selectedWeek}
                onWeekPrev={() => changeWeek('prev')}
                onWeekNext={() => changeWeek('next')}
                selectedDay={selectedDay}
                onDayChange={setSelectedDay}
                staffValue={staffFilter ?? 'ALL'}
                onStaffChange={(id) => {
                    setStaffFilter(id === 'ALL' ? null : id);
                    setFilterMode('HARD');
                }}
                staffOptions={staffOptions}
                showDayAndStaff={viewMode !== 'grid'}
            />

            {/* View toggle — desktop only */}
            <div className="hidden lg:flex items-center gap-2 mb-4">
                <button
                    onClick={() => setViewMode('grid')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        viewMode === 'grid'
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                >
                    <CalendarDays size={14} />
                    Weekly Grid
                </button>
                <button
                    onClick={() => setViewMode('list')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        viewMode === 'list'
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                >
                    <LayoutList size={14} />
                    List View
                </button>
            </div>

            {/* ── DESKTOP: Grid view ─────────────────────────────────────── */}
            {viewMode === 'grid' && (
                <div className="hidden lg:block mb-8">
                    <div className="mb-3">
                        <h3 className="text-section-title">
                            Weekly Roster
                        </h3>
                    </div>
                    <RosterWeeklyGrid
                        staff={staffList}
                        shifts={shifts}
                        availability={availability}
                        weekStart={selectedWeek}
                        onCellClick={handleGridCellClick}
                    />
                </div>
            )}

            {/* ── DESKTOP: List view ────────────────────────────────────────── */}
            {(viewMode === 'list' || selectedDay === -1) && (
                <div className="hidden lg:grid lg:grid-cols-2 gap-8">
                    {/* LEFT SECTION - Roster */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-section-title">
                                Roster · {selectedDay === -1 ? 'Full week' : getDayName(selectedDay)}
                            </h3>
                            <Badge variant="success">Active</Badge>
                        </div>
                        <div className="space-y-4">
                            {(() => {
                                const shouldHardFilter = filterMode === 'HARD' || selectedDay === -1;
                                const rosterShifts = shouldHardFilter && staffFilter
                                    ? shifts.filter(s => s.staffId === staffFilter)
                                    : shifts;

                                return rosterShifts.length === 0 ? (
                                    <div className="card-base p-10 text-center bg-gray-50/30 border-dashed">
                                        <p className="text-sm text-gray-400 font-medium italic">No approved shifts for this criteria</p>
                                    </div>
                                ) : (
                                    rosterShifts.map((shift) => (
                                        <RosterShiftCard
                                            key={shift.id}
                                            shift={shift}
                                            staffName={staffMap[shift.staffId]?.name || 'Unknown staff'}
                                            showDayBadge={selectedDay === -1}
                                            highlighted={staffFilter === shift.staffId}
                                            onSelect={
                                                selectedDay === -1
                                                    ? () => {
                                                          if (!staffFilter) {
                                                              setStaffFilter(shift.staffId);
                                                              setFilterMode('HIGHLIGHT');
                                                          } else if (filterMode === 'HIGHLIGHT' && staffFilter === shift.staffId) {
                                                              setStaffFilter(null);
                                                          }
                                                      }
                                                    : undefined
                                            }
                                            onEdit={() => openEditModal(shift)}
                                            onRemove={() => handleRemoveShift(shift.id!)}
                                        />
                                    ))
                                );
                            })()}
                        </div>
                    </div>

                    {/* RIGHT SECTION - Availability */}
                    <div>
                        <div className="flex items-center justify-between mb-4 px-2">
                            <h3 className="text-section-title">
                                Availability · {selectedDay === -1 ? 'Full week' : getDayName(selectedDay)}
                            </h3>
                            <Badge variant="info">Submissions</Badge>
                        </div>
                        <div className="space-y-4">
                            {dayAvailability.length === 0 ? (
                                <div className="card-base p-10 text-center bg-gray-50/30 border-dashed">
                                    <p className="text-sm text-gray-400 font-medium italic">
                                        {staffFilter
                                            ? `No availability submitted for ${staffMap[staffFilter]?.name}`
                                            : 'No availability submitted for this period'}
                                    </p>
                                </div>
                            ) : (
                                dayAvailability.map((avail) => {
                                    const rosteredForDay = shifts.some((s) => {
                                        const shiftDay = s.date.toDate().getDay();
                                        return s.staffId === avail.staffId && shiftDay === avail.dayOfWeek;
                                    });
                                    return (
                                        <AvailabilityCard
                                            key={avail.id}
                                            staffName={staffMap[avail.staffId]?.name || 'Unknown staff'}
                                            dayOfWeek={selectedDay === -1 ? avail.dayOfWeek : undefined}
                                            timeRanges={avail.timeRanges}
                                            rosteredForDay={rosteredForDay}
                                            highlighted={staffFilter === avail.staffId}
                                            onApprove={() =>
                                                openApprovalModal(avail.staffId, avail.timeRanges, avail.dayOfWeek)
                                            }
                                        />
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── MOBILE: Tab view (unchanged) ─────────────────────────────── */}
            <div className="lg:hidden admin-section-card">
                <AdminTabs
                    tabs={[
                        { id: 'roster', label: 'Roster', count: shifts.length },
                        { id: 'availability', label: 'Availability', count: dayAvailability.length },
                    ]}
                    activeId={activeMobileTab}
                    onChange={(id) => setActiveMobileTab(id as 'roster' | 'availability')}
                />
                <div className="p-4 space-y-3 min-h-[320px]">
                    {activeMobileTab === 'roster' ? (
                        shifts.length === 0 ? (
                            <div className="py-20 text-center">
                                <p className="text-gray-400 text-sm font-medium italic">No approved shifts</p>
                            </div>
                        ) : (
                            shifts.map((shift) => (
                                <RosterShiftCard
                                    key={shift.id}
                                    shift={shift}
                                    staffName={staffMap[shift.staffId]?.name || 'Staff'}
                                    showDayBadge
                                    compact
                                    highlighted={staffFilter === shift.staffId}
                                    onSelect={
                                        selectedDay === -1
                                            ? () => {
                                                  setStaffFilter((prev) =>
                                                      prev === shift.staffId ? null : shift.staffId
                                                  );
                                                  setFilterMode('HIGHLIGHT');
                                              }
                                            : undefined
                                    }
                                    onEdit={() => openEditModal(shift)}
                                    onRemove={() => handleRemoveShift(shift.id!)}
                                />
                            ))
                        )
                    ) : (
                        dayAvailability.length === 0 ? (
                            <div className="py-20 text-center">
                                <p className="text-gray-400 text-sm font-medium italic">
                                    {staffFilter
                                        ? `No availability for ${staffMap[staffFilter]?.name}`
                                        : 'No submissions'}
                                </p>
                            </div>
                        ) : (
                            dayAvailability.map((avail) => {
                                const rosteredForDay = shifts.some((s) => {
                                    const shiftDay = s.date.toDate().getDay();
                                    return s.staffId === avail.staffId && shiftDay === avail.dayOfWeek;
                                });
                                return (
                                    <AvailabilityCard
                                        key={avail.id}
                                        staffName={staffMap[avail.staffId]?.name || 'Staff'}
                                        dayOfWeek={avail.dayOfWeek}
                                        timeRanges={avail.timeRanges}
                                        rosteredForDay={rosteredForDay}
                                        highlighted={staffFilter === avail.staffId}
                                        onApprove={() =>
                                            openApprovalModal(avail.staffId, avail.timeRanges, avail.dayOfWeek)
                                        }
                                    />
                                );
                            })
                        )
                    )}
                </div>
            </div>

            {/* ── Form Modal (list-view new/edit) ──────────────────────────── */}
            <AdminFormModal
                open={showApprovalModal && !!selectedStaff}
                onClose={() => setShowApprovalModal(false)}
                title={isEditingShift ? 'Modify shift' : 'Approve shift'}
                description={`${selectedStaff?.name ?? ''} · ${getDayName(selectedStaff?.dayOfWeek ?? selectedDay)}`}
                footer={
                    (() => {
                        const hasConflict = !isWithinAvailability(shiftForm.startTime, shiftForm.endTime, selectedStaff?.ranges || []);
                        return (
                            <div className="flex w-full items-center justify-between gap-2">
                                {isEditingShift && editingShiftId && (
                                    <Button
                                        type="button"
                                        variant="danger"
                                        onClick={() => {
                                            handleRemoveShift(editingShiftId);
                                            setShowApprovalModal(false);
                                        }}
                                    >
                                        Delete Shift
                                    </Button>
                                )}
                                <div className="flex gap-2 ml-auto">
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        onClick={() => setShowApprovalModal(false)}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="primary"
                                        onClick={handleSaveShift}
                                        disabled={hasConflict && !forceOverride}
                                    >
                                        {isEditingShift ? 'Update Shift' : 'Approve Shift'}
                                    </Button>
                                </div>
                            </div>
                        );
                    })()
                }
            >
                {selectedStaff && (
                    (() => {
                        const hasConflict = !isWithinAvailability(shiftForm.startTime, shiftForm.endTime, selectedStaff.ranges || []);
                        
                        // Check if target date is in the past
                        const targetDate = new Date(selectedWeek);
                        const shiftDay = selectedStaff.dayOfWeek ?? selectedDay;
                        const finalDay = shiftDay === -1 ? new Date().getDay() : shiftDay;
                        targetDate.setDate(targetDate.getDate() + (finalDay === 0 ? 6 : finalDay - 1));
                        targetDate.setHours(0, 0, 0, 0);
                        
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const isPastDate = targetDate.getTime() < today.getTime();

                        return (
                            <>
                                <div className="mb-4 p-4 bg-blue-50/50 border border-blue-100 rounded-xl">
                                    <p className="text-label text-blue-800 mb-2">Availability</p>
                                    {selectedStaff.ranges.length === 0 ? (
                                        <p className="text-sm text-amber-800">No submission for this day.</p>
                                    ) : (
                                        selectedStaff.ranges.map((range, idx) => (
                                            <p key={idx} className="text-sm font-semibold tabular-nums text-gray-900">
                                                {range.start} – {range.end}
                                            </p>
                                        ))
                                    )}
                                </div>

                                {isPastDate && (
                                    <div className="mb-4 p-3 bg-slate-50 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold flex gap-2.5 items-start">
                                        <Calendar size={16} className="text-slate-500 shrink-0 mt-0.5" />
                                        <div>
                                            <p className="font-semibold text-slate-800">Past Date Warning</p>
                                            <p className="text-slate-600 mt-0.5">You are scheduling a rostered shift for a day that has already passed.</p>
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-4">
                                    <div>
                                        <label className="text-label block mb-1">Shift start</label>
                                        <Input
                                            type="time"
                                            value={shiftForm.startTime}
                                            onChange={(e) => setShiftForm({ ...shiftForm, startTime: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-label block mb-1">Shift end</label>
                                        <Input
                                            type="time"
                                            value={shiftForm.endTime}
                                            onChange={(e) => setShiftForm({ ...shiftForm, endTime: e.target.value })}
                                        />
                                    </div>

                                    {hasConflict && (
                                        <div className="space-y-3 pt-2">
                                            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs font-semibold flex gap-2.5 items-start">
                                                <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                                                <div>
                                                    <p className="font-semibold text-amber-800">Availability Conflict</p>
                                                    <p className="text-amber-700 mt-0.5">This shift falls outside the staff member&apos;s submitted availability times.</p>
                                                </div>
                                            </div>
                                            <label className="flex items-center gap-2.5 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100/50 transition-colors">
                                                <input
                                                    type="checkbox"
                                                    checked={forceOverride}
                                                    onChange={(e) => setForceOverride(e.target.checked)}
                                                    className="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500 focus:ring-offset-0"
                                                />
                                                <span className="text-xs font-semibold text-slate-700 select-none">
                                                    Force override availability limits
                                                </span>
                                            </label>
                                        </div>
                                    )}
                                </div>
                            </>
                        );
                    })()
                )}
            </AdminFormModal>
        </>
    );
}
