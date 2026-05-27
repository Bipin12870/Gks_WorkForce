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
import { Availability, Shift, User } from '@/types';
import { getWeekStart, getDayName, formatDate } from '@/lib/utils';
import { createShift, updateShift, deleteShift } from '@/app/actions/shifts';
import { useNotification } from '@/contexts/NotificationContext';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import AdminFilterBar from '@/components/admin/AdminFilterBar';
import AdminTabs from '@/components/admin/AdminTabs';
import AdminFormModal, { AdminModalFooter } from '@/components/admin/AdminFormModal';
import RosterShiftCard from '@/components/admin/RosterShiftCard';
import AvailabilityCard from '@/components/admin/AvailabilityCard';
import Badge from '@/components/ui/Badge';
import Input from '@/components/ui/Input';
import EmptyState from '@/components/ui/EmptyState';
import { CalendarDays, CheckCircle2 } from 'lucide-react';

export default function AdminRosterPage() {
    const { userData } = useAuth();
    const { showNotification } = useNotification();
    const [selectedWeek, setSelectedWeek] = useState<Date>(getWeekStart(new Date()));
    const [selectedDay, setSelectedDay] = useState<number>(new Date().getDay());
    const [availability, setAvailability] = useState<Availability[]>([]);
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [staffMap, setStaffMap] = useState<Record<string, User>>({});
    const [showApprovalModal, setShowApprovalModal] = useState(false);
    const [selectedStaff, setSelectedStaff] = useState<{ id: string; name: string; ranges: any[]; dayOfWeek?: number } | null>(null);
    const [shiftForm, setShiftForm] = useState({ startTime: '09:00', endTime: '17:00' });
    const [isEditingShift, setIsEditingShift] = useState(false);
    const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
    const [activeMobileTab, setActiveMobileTab] = useState<'roster' | 'availability'>('roster');
    const [staffFilter, setStaffFilter] = useState<string | null>(null);
    const [filterMode, setFilterMode] = useState<'HARD' | 'HIGHLIGHT'>('HARD');

    // Load staff data
    useEffect(() => {
        if (userData?.role === 'ADMIN') {
            loadStaff();
        }
    }, [userData]);

    // Real-time listener for availability (RIGHT SECTION)
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

    // Real-time listener for shifts (LEFT SECTION)
    useEffect(() => {
        if (!userData || userData.role !== 'ADMIN') return;

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

    const openApprovalModal = (staffId: string, ranges: any[], dayOfWeek?: number) => {
        const staff = staffMap[staffId];
        if (!staff) return;

        setSelectedStaff({ id: staffId, name: staff.name, ranges, dayOfWeek });
        setShiftForm({ startTime: ranges[0]?.start || '09:00', endTime: ranges[0]?.end || '17:00' });
        setIsEditingShift(false);
        setEditingShiftId(null);
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

        setSelectedStaff({ id: shift.staffId, name: staff.name, ranges, dayOfWeek: shift.date.toDate().getDay() });
        setShiftForm({ startTime: shift.startTime, endTime: shift.endTime });
        setIsEditingShift(true);
        setEditingShiftId(shift.id!);
        setShowApprovalModal(true);
    };

    const handleSaveShift = async () => {
        if (!selectedStaff || !userData) return;

        try {
            if (isEditingShift && editingShiftId) {
                await updateShift(editingShiftId, {
                    startTime: shiftForm.startTime,
                    endTime: shiftForm.endTime,
                });
                showNotification('Shift updated successfully!', 'success');
            } else {
                // Determine the target date from the selected week + day
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
                });
                showNotification('Shift approved successfully!', 'success');
            }

            setShowApprovalModal(false);
            setSelectedStaff(null);
            setIsEditingShift(false);
            setEditingShiftId(null);
        } catch (error) {
            console.error('Error saving shift:', error);
            showNotification((error as Error).message || 'Failed to save shift. Please try again.', 'error');
        }
    };

    const handleRemoveShift = async (shift: Shift) => {
        if (!window.confirm(`Are you sure you want to remove ${staffMap[shift.staffId]?.name || 'this staff'} from this shift?`)) return;

        try {
            await deleteShift(shift.id!);
            showNotification('Shift removed successfully', 'success');
        } catch (error) {
            console.error('Error removing shift:', error);
            showNotification((error as Error).message || 'Failed to remove shift', 'error');
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
            />

                    {/* Two-Section Layout - Desktop/Tablet */}
                    <div className="hidden lg:grid lg:grid-cols-2 gap-8">
                        {/* LEFT SECTION - Roster View */}
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-section-title">
                                    Roster · {selectedDay === -1 ? 'Full week' : getDayName(selectedDay)}
                                </h3>
                                <Badge variant="success">Active</Badge>
                            </div>
                            <div className="space-y-4">
                                {(() => {
                                    // Force hard filter for All Week view
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
                                                onRemove={() => handleRemoveShift(shift)}
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
                                                onRemove={() => handleRemoveShift(shift)}
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

            <AdminFormModal
                open={showApprovalModal && !!selectedStaff}
                onClose={() => setShowApprovalModal(false)}
                title={isEditingShift ? 'Modify shift' : 'Approve shift'}
                description={`${selectedStaff?.name ?? ''} · ${getDayName(selectedStaff?.dayOfWeek ?? selectedDay)}`}
                footer={
                    <AdminModalFooter
                        onCancel={() => setShowApprovalModal(false)}
                        onPrimary={handleSaveShift}
                        primaryLabel={isEditingShift ? 'Update shift' : 'Approve shift'}
                    />
                }
            >
                {selectedStaff && (
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
                        </div>
                    </>
                )}
            </AdminFormModal>
        </>
    );
}
