'use server';

import { adminAuth } from '@/lib/firebase-admin';
import { revalidatePath } from 'next/cache';

export async function resetStaffPassword(userId: string, newPassword: string) {
    try {
        if (!userId || !newPassword) {
            throw new Error('User ID and new password are required');
        }

        if (newPassword.length < 6) {
            throw new Error('Password must be at least 6 characters long');
        }

        // Update the user's password using Firebase Admin SDK
        await adminAuth.updateUser(userId, {
            password: newPassword,
        });

        // Revalidate the staff page
        revalidatePath('/admin/staff');

        return { success: true };
    } catch (error: any) {
        console.error('Error resetting staff password:', error);
        return { success: false, error: error.message || 'Failed to reset password' };
    }
}
