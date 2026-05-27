'use server';

import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';
import * as admin from 'firebase-admin';
import { requireAdmin } from './shared/auth';
import { logAuditEvent } from '@/lib/audit-logger';

/**
 * Creates a new staff user and their profile document (Admin only).
 * Uses Firebase Admin SDK to create the Auth account directly on the server.
 */
export async function createStaffAccount(username: string, password: string, name: string, hourlyRate: number) {
    try {
        const adminUser = await requireAdmin();
        const auth = getAdminAuth();
        const db = getAdminDb();

        const trimmedUsername = username.trim();
        if (!trimmedUsername) {
            throw new Error('Username is required.');
        }
        if (password.length < 6) {
            throw new Error('Password must be at least 6 characters long.');
        }

        const dummyEmail = `${trimmedUsername}@internal.gks`;

        // 1. Create user in Firebase Auth
        const userRecord = await auth.createUser({
            email: dummyEmail,
            password,
            displayName: name,
        });

        // 2. Create user document in Firestore
        await db.collection('users').doc(userRecord.uid).set({
            name,
            email: dummyEmail,
            username: trimmedUsername,
            role: 'STAFF',
            hourlyRate,
            isActive: true,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // 3. Log Audit Event
        await logAuditEvent({
            actorId: adminUser.id,
            actorRole: adminUser.role,
            action: 'STAFF_CREATE',
            targetCollection: 'users',
            targetDocumentId: userRecord.uid,
            newValues: {
                name,
                email: dummyEmail,
                username: trimmedUsername,
                role: 'STAFF',
                hourlyRate,
                isActive: true,
            },
        });

        return { success: true, uid: userRecord.uid };
    } catch (error: any) {
        console.error('Error in createStaffAccount:', error);
        let message = error.message || 'Failed to create staff account';
        if (error.code === 'auth/email-already-in-use') {
            message = 'This username is already taken. Please choose another one.';
        } else if (error.code === 'auth/weak-password') {
            message = 'Password is too weak. Please use at least 6 characters.';
        }
        throw new Error(message);
    }
}

/**
 * Updates a staff member's profile (name, rate) (Admin only).
 */
export async function updateStaffProfile(staffId: string, name: string, hourlyRate: number) {
    try {
        const adminUser = await requireAdmin();
        const auth = getAdminAuth();
        const db = getAdminDb();

        // 1. Fetch current profile
        const userDoc = await db.collection('users').doc(staffId).get();
        if (!userDoc.exists) {
            throw new Error('User not found.');
        }
        const previousData = userDoc.data()!;

        // 2. Update Firestore
        await db.collection('users').doc(staffId).update({
            name,
            hourlyRate,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // 3. Update Auth display name
        await auth.updateUser(staffId, {
            displayName: name,
        });

        // 4. Log Audit Event
        await logAuditEvent({
            actorId: adminUser.id,
            actorRole: adminUser.role,
            action: 'STAFF_UPDATE',
            targetCollection: 'users',
            targetDocumentId: staffId,
            previousValues: {
                name: previousData.name,
                hourlyRate: previousData.hourlyRate,
            },
            newValues: {
                name,
                hourlyRate,
            },
        });

        return { success: true };
    } catch (error) {
        console.error('Error in updateStaffProfile:', error);
        throw new Error((error as Error).message);
    }
}

/**
 * Activates or deactivates a staff member (Admin only).
 */
export async function toggleStaffActive(staffId: string, currentStatus: boolean) {
    try {
        const adminUser = await requireAdmin();
        const db = getAdminDb();

        const newStatus = !currentStatus;

        // 1. Update Firestore
        await db.collection('users').doc(staffId).update({
            isActive: newStatus,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // 2. Log Audit Event
        await logAuditEvent({
            actorId: adminUser.id,
            actorRole: adminUser.role,
            action: newStatus ? 'STAFF_ACTIVATE' : 'STAFF_DEACTIVATE',
            targetCollection: 'users',
            targetDocumentId: staffId,
            previousValues: {
                isActive: currentStatus,
            },
            newValues: {
                isActive: newStatus,
            },
        });

        return { success: true };
    } catch (error) {
        console.error('Error in toggleStaffActive:', error);
        throw new Error((error as Error).message);
    }
}

/**
 * Resets a staff member's password (Admin only).
 */
export async function resetStaffPassword(staffId: string, newPassword: string) {
    try {
        const adminUser = await requireAdmin();
        const auth = getAdminAuth();

        if (newPassword.length < 6) {
            throw new Error('Password must be at least 6 characters long.');
        }

        // 1. Update Password in Auth
        await auth.updateUser(staffId, {
            password: newPassword,
        });

        // 2. Log Audit Event
        await logAuditEvent({
            actorId: adminUser.id,
            actorRole: adminUser.role,
            action: 'STAFF_PASSWORD_RESET',
            targetCollection: 'users',
            targetDocumentId: staffId,
        });

        return { success: true };
    } catch (error) {
        console.error('Error in resetStaffPassword:', error);
        throw new Error((error as Error).message);
    }
}

/**
 * Deletes a staff account and cleans up all associated documents (Admin only).
 * Performs cascade deletes of shifts, availability, records, logs, and Auth account.
 */
export async function deleteStaffAccountFull(staffId: string) {
    try {
        const adminUser = await requireAdmin();
        const auth = getAdminAuth();
        const db = getAdminDb();

        // 1. Fetch user to preserve display name for audit logs
        const userDoc = await db.collection('users').doc(staffId).get();
        if (!userDoc.exists) {
            throw new Error('User not found.');
        }
        const userData = userDoc.data()!;

        // 2. Delete the user from Firebase Auth
        try {
            await auth.deleteUser(staffId);
        } catch (error: any) {
            // If the user is already gone from Auth, we proceed with cascade deletes
            if (error.code !== 'auth/user-not-found') {
                throw error;
            }
        }

        // 3. Query all related documents to delete
        const batch = db.batch();

        // - Shifts
        const shiftsSnap = await db.collection('shifts').where('staffId', '==', staffId).get();
        shiftsSnap.docs.forEach((doc) => batch.delete(doc.ref));

        // - Availability
        const availSnap = await db.collection('availability').where('staffId', '==', staffId).get();
        availSnap.docs.forEach((doc) => batch.delete(doc.ref));

        // - TimeRecords
        const timeRecordsSnap = await db.collection('timeRecords').where('staffId', '==', staffId).get();
        timeRecordsSnap.docs.forEach((doc) => batch.delete(doc.ref));

        // - Roster Audit Logs
        const rosterLogsSnap = await db.collection('rosterAuditLogs').where('staffId', '==', staffId).get();
        rosterLogsSnap.docs.forEach((doc) => batch.delete(doc.ref));

        // - Timesheets
        const timesheetsSnap = await db.collection('timesheets').where('staffId', '==', staffId).get();
        timesheetsSnap.docs.forEach((doc) => batch.delete(doc.ref));

        // - User document
        batch.delete(db.collection('users').doc(staffId));

        // 4. Commit Firestore batch
        await batch.commit();

        // 5. Log Audit Event
        await logAuditEvent({
            actorId: adminUser.id,
            actorRole: adminUser.role,
            action: 'STAFF_DELETE_FULL',
            targetCollection: 'users',
            targetDocumentId: staffId,
            previousValues: {
                name: userData.name,
                email: userData.email,
                username: userData.username,
                role: userData.role,
                hourlyRate: userData.hourlyRate,
            },
        });

        return { success: true };
    } catch (error) {
        console.error('Error in deleteStaffAccountFull:', error);
        throw new Error((error as Error).message);
    }
}
