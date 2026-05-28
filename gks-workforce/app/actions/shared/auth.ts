import 'server-only';
import { cookies } from 'next/headers';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { User } from '@/types';

/**
 * Retrieves the currently authenticated user from the session cookie.
 * Swallows errors to return null for optional auth checks.
 */
export async function getCurrentUser(): Promise<User | null> {
    try {
        const user = await getCurrentUserOrThrow();
        return user;
    } catch (error) {
        console.error('Error getting current user:', error);
        return null;
    }
}

/**
 * Retrieves the currently authenticated user or throws a detailed error explaining
 * exactly why authentication failed.
 */
export async function getCurrentUserOrThrow(): Promise<User> {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('__session')?.value;

    if (!sessionCookie) {
        throw new Error('Unauthorized: Authentication required (no session cookie found)');
    }

    let decodedClaims;
    try {
        const auth = getAdminAuth();
        decodedClaims = await auth.verifySessionCookie(sessionCookie, true);
    } catch (error) {
        throw new Error(`Unauthorized: Session verification failed: ${(error as Error).message}`);
    }

    const uid = decodedClaims.uid;
    const db = getAdminDb();
    
    let userDoc;
    try {
        userDoc = await db.collection('users').doc(uid).get();
    } catch (error) {
        throw new Error(`Unauthorized: Failed to fetch user profile database record: ${(error as Error).message}`);
    }

    if (!userDoc.exists) {
        throw new Error(`Unauthorized: User profile record not found for ID: ${uid}`);
    }

    const userData = userDoc.data() || {};
    return {
        id: userDoc.id,
        ...userData,
        isActive: userData.isActive !== false,
    } as User;
}

/**
 * Guard that enforces that the user must be authenticated as an active ADMIN.
 */
export async function requireAdmin(): Promise<User> {
    const user = await getCurrentUserOrThrow();
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
    const user = await getCurrentUserOrThrow();
    if (!user.isActive) {
        throw new Error('Unauthorized: User account is inactive');
    }
    if (user.role !== 'STAFF' && user.role !== 'ADMIN') {
        throw new Error('Unauthorized: Staff access required');
    }
    return user;
}
