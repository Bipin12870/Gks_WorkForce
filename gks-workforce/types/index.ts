import { Timestamp } from 'firebase/firestore';

export type UserRole = 'STAFF' | 'ADMIN';

export interface User {
    id: string;
    name: string;
    email: string;
    username?: string; // Optional field for staff
    role: UserRole;
    hourlyRate: number;
    isActive: boolean;
    createdAt: Timestamp;
    updatedAt: Timestamp;
}

export interface TimeRange {
    start: string; // HH:mm format
    end: string;   // HH:mm format
}

export type AvailabilityStatus = 'DRAFT' | 'SUBMITTED';

export interface Availability {
    id?: string;
    staffId: string;
    weekStartDate: Timestamp; // Monday 00:00
    dayOfWeek: number; // 0=Sunday, 1=Monday, ..., 6=Saturday
    timeRanges: TimeRange[];
    isRecurring: boolean;
    status: AvailabilityStatus;
    submittedAt: Timestamp | null;
    createdAt: Timestamp;
    updatedAt: Timestamp;
}

export type ShiftStatus = 'APPROVED';

export interface Shift {
    id?: string;
    staffId: string;
    date: Timestamp; // Specific day
    startTime: string; // HH:mm format
    endTime: string;   // HH:mm format
    status: ShiftStatus;
    approvedBy: string; // Admin user ID
    approvedAt: Timestamp;
    createdAt: Timestamp;
    updatedAt?: Timestamp;
    updatedBy?: string;
}

export interface RosterAuditLog {
    id?: string;
    adminId: string;
    shiftId: string;
    staffId: string;
    action: 'EDIT' | 'REMOVE';
    previousData?: Partial<Shift>;
    newData?: Partial<Shift>;
    timestamp: Timestamp;
}

// ─────────────────────────────────────────────────────────────
// GEOFENCING — TIME RECORDS
// ─────────────────────────────────────────────────────────────

/** How a TimeRecord was closed */
export type TimeRecordSource = 'GPS' | 'AUTO_CLOSED';

export interface TimeRecord {
    id?: string;
    staffId: string;

    // Clock-in
    clockInTime: Timestamp;           // exact timestamp
    clockInRounded: string;           // HH:mm — rounded to nearest 5 min
    clockInLat: number;
    clockInLng: number;
    clockInAccuracy: number;          // metres (browser GPS accuracy)

    // Clock-out (null while active)
    clockOutTime: Timestamp | null;
    clockOutRounded: string | null;   // HH:mm — rounded to nearest 5 min
    clockOutLat: number | null;
    clockOutLng: number | null;
    clockOutAccuracy: number | null;
    clockOutWithinGeofence: boolean | null; // was clock-out inside radius?

    // Computed
    hoursWorked: number | null;       // based on rounded times

    // Links
    shiftId: string | null;           // matched shift (set on clock-out)
    timesheetId: string | null;       // generated timesheet

    source: TimeRecordSource;
    createdAt: Timestamp;
    updatedAt: Timestamp;
}

// ─────────────────────────────────────────────────────────────
// GEOFENCING — TIMESHEETS
// ─────────────────────────────────────────────────────────────

export type TimesheetStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

/**
 * How the timesheet was generated:
 * - MANUAL         → staff entered times manually (old path, fallback)
 * - GPS_VERIFIED   → clocked in+out within 100m, within rostered hours
 * - GPS_OVERTIME   → within 100m but actual time exceeded rostered end
 * - GPS_OUTSIDE    → clocked out outside 100m — rostered end time applied
 * - AUTO_CLOSED    → system auto-closed because staff forgot to clock out
 * - GPS_UNMATCHED  → clocked in/out but no matching shift found
 * - AFTER_HOURS    → clocked out after store hours (23:59)
 */
export type TimesheetSource =
    | 'MANUAL'
    | 'GPS_VERIFIED'
    | 'GPS_OVERTIME'
    | 'GPS_OUTSIDE'
    | 'AUTO_CLOSED'
    | 'GPS_UNMATCHED'
    | 'AFTER_HOURS';

export interface Timesheet {
    id?: string;
    staffId: string;
    shiftId: string | null;           // null for GPS_UNMATCHED
    date: Timestamp;
    weekStartDate: Timestamp;         // Monday 00:00
    approvedShiftStart: string;       // HH:mm — from rostered shift
    approvedShiftEnd: string;         // HH:mm — from rostered shift
    workedStart: string;              // HH:mm — actual (rounded) or rostered
    workedEnd: string;                // HH:mm — actual (rounded) or rostered
    status: TimesheetStatus;

    // Geofence metadata (set when source !== 'MANUAL')
    source: TimesheetSource;
    timeRecordId?: string;            // linked TimeRecord
    clockInLat?: number;
    clockInLng?: number;
    clockOutLat?: number | null;
    clockOutLng?: number | null;
    clockOutDistanceMetres?: number | null;  // distance from shop at clock-out

    // Admin action on flagged records
    requiresAdminNote: boolean;       // true for OUTSIDE / OVERTIME / AUTO_CLOSED
    adminNote?: string;               // admin fills this when approving

    createdAt: Timestamp;
    updatedAt: Timestamp;
}

// ─────────────────────────────────────────────────────────────
// SHOP LOCATION CONFIG
// ─────────────────────────────────────────────────────────────

export interface ShopLocation {
    lat: number;
    lng: number;
    radiusMetres: number;   // geofence radius, default 100
    name: string;           // e.g. "GKS Shop"
    setAt: Timestamp;
    setBy: string;          // admin uid
}
