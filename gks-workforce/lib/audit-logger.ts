import 'server-only';
import { getAdminDb } from './firebase-admin';
import { UserRole } from '../types';

export interface AuditParams {
    actorId: string;
    actorRole: UserRole;
    action: string;
    targetCollection: string;
    targetDocumentId: string;
    previousValues?: Record<string, any> | null;
    newValues?: Record<string, any> | null;
    reason?: string | null;
}

export async function logAuditEvent(params: AuditParams): Promise<void> {
    try {
        const db = getAdminDb();
        const admin = await import('firebase-admin');
        const timestamp = admin.firestore.FieldValue.serverTimestamp();

        await db.collection('auditLogs').add({
            actorId: params.actorId,
            actorRole: params.actorRole,
            action: params.action,
            targetCollection: params.targetCollection,
            targetDocumentId: params.targetDocumentId,
            previousValues: params.previousValues ?? null,
            newValues: params.newValues ?? null,
            reason: params.reason ?? null,
            timestamp,
        });
    } catch (error) {
        console.error('Failed to log audit event:', error, params);
        throw new Error(`Audit logging failed: ${(error as Error).message}`);
    }
}
