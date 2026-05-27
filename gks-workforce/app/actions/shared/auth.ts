import 'server-only';
import { cookies } from 'next/headers';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { User } from '@/types';

/**
 * Retrieves the currently authenticated user from the session cookie.
 */
export async function getCurrentUser(): Promise<User | null> {
    try {
        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get('__session')?.value;

        if (!sessionCookie) {
            return null;
        }

        const auth = getAdminAuth();
        const decodedClaims = await auth.verifySessionCookie(sessionCookie, true);
        const uid = decodedClaims.uid;

        const db = getAdminDb();
        const userDoc = await db.collection('users').doc(uid).get();

        if (!userDoc.exists) {
            return null;
        }

        const userData = userDoc.data() || {};
        return {
            id: userDoc.id,
            ...userData,
            isActive: userData.isActive !== false,
        } as User;
    } catch (error) {
        console.error('Error getting current user:', error);
        return null;
    }
}

/**
 * Guard that enforces that the user must be authenticated as an active ADMIN.
 */
export async function requireAdmin(): Promise<User> {
    const user = await getCurrentUser();
    if (!user) {
        throw new Error('Unauthorized: Authentication required');
    }
    if (!user.isActive) {
        throw new Error('Unauthorized: User account is inactive');
    }
    if (user.role !== 'ADMIN') {
        throw new Error('Unauthorized: Admin access required');
    }
    return user;
}

/**
 * Guard that enforces that the user must be authenticated as an active STAFF (or ADMIN).
 */
export async function requireStaff(): Promise<User> {
    const user = await getCurrentUser();
    if (!user) {
        throw new Error('Unauthorized: Authentication required');
    }
    if (!user.isActive) {
        throw new Error('Unauthorized: User account is inactive');
    }
    if (user.role !== 'STAFF' && user.role !== 'ADMIN') {
        throw new Error('Unauthorized: Staff access required');
    }
    return user;
}
