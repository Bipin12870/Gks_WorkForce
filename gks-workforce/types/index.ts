import { Timestamp } from 'firebase/firestore';

export type UserRole = 'STAFF' | 'ADMIN';

export interface User {
    id: string;
    name: string;
    email: string;
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
}

export interface TimeRecord {
    id?: string;
    staffId: string;
    clockInTime: Timestamp;
    clockOutTime: Timestamp | null;
    hoursWorked: number | null;
    createdAt: Timestamp;
    updatedAt: Timestamp;
}
