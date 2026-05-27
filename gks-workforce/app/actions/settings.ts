'use server';

import { getAdminDb } from '@/lib/firebase-admin';
import * as admin from 'firebase-admin';
import { requireAdmin } from './shared/auth';
import { logAuditEvent } from '@/lib/audit-logger';

/**
 * Saves or updates the physical shop location geofencing parameters (Admin only).
 */
export async function saveShopLocation(lat: number, lng: number, radiusMetres: number, name: string) {
    try {
        const adminUser = await requireAdmin();
        const db = getAdminDb();

        const trimmedName = name.trim();

        // 1. Coordinates validation
        if (isNaN(lat) || lat < -90 || lat > 90) {
            throw new Error('Latitude must be a number between -90 and 90.');
        }
        if (isNaN(lng) || lng < -180 || lng > 180) {
            throw new Error('Longitude must be a number between -180 and 180.');
        }

        // 2. Radius validation (10m to 2000m)
        if (isNaN(radiusMetres) || radiusMetres < 10 || radiusMetres > 2000) {
            throw new Error('Radius must be between 10 and 2000 metres.');
        }

        // 3. Name validation
        if (!trimmedName) {
            throw new Error('Please enter a name for the location.');
        }

        const docRef = db.collection('config').doc('shopLocation');
        const existingDoc = await docRef.get();
        const previousValues = existingDoc.exists ? existingDoc.data() : null;

        const newValues = {
            lat,
            lng,
            radiusMetres,
            name: trimmedName,
            setAt: admin.firestore.FieldValue.serverTimestamp(),
            setBy: adminUser.id,
        };

        // 4. Save to Firestore
        await docRef.set(newValues);

        // 5. Log Audit Event
        await logAuditEvent({
            actorId: adminUser.id,
            actorRole: adminUser.role,
            action: 'SAVE_SHOP_LOCATION',
            targetCollection: 'config',
            targetDocumentId: 'shopLocation',
            previousValues,
            newValues,
        });

        return { success: true };
    } catch (error) {
        console.error('Error in saveShopLocation:', error);
        throw new Error((error as Error).message);
    }
}
