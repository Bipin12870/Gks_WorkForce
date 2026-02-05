import * as admin from 'firebase-admin';

let adminAuth: admin.auth.Auth;
let adminDb: admin.firestore.Firestore;

try {
    if (!admin.apps.length) {
        const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
        const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
        const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

        if (!projectId || !clientEmail || !privateKey) {
            console.warn('Firebase admin initialization skipped: Missing environment variables');
        } else {
            admin.initializeApp({
                credential: admin.credential.cert({
                    projectId,
                    clientEmail,
                    privateKey,
                }),
            });
            console.log('Firebase admin initialized successfully');
        }
    }
} catch (error) {
    console.error('Firebase admin initialization error:', error);
}

// We wrap the gets in a way that provides a more helpful error if they're called but not initialized
export const getAdminAuth = () => {
    if (!admin.apps.length) {
        throw new Error('Firebase Admin Auth failed to initialize. Check environment variables.');
    }
    return admin.auth();
};

export const getAdminDb = () => {
    if (!admin.apps.length) {
        throw new Error('Firebase Admin Firestore failed to initialize. Check environment variables.');
    }
    return admin.firestore();
};

// Maintain compatibility with existing code for now but mark as potentially problematic
export { adminAuth, adminDb };
