const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// 1. Load Environment Variables from .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8');
    envConfig.split('\n').forEach((line) => {
        const match = line.match(/^([^=:#]+?)[=:](.*)/);
        if (match) {
            const key = match[1].trim();
            const value = match[2].trim().replace(/(^['"]|['"]$)/g, '');
            process.env[key] = value;
        }
    });
} else {
    console.error('No .env.local file found. Please run this script from the project root.');
    process.exit(1);
}

// 2. Initialize Firebase Admin
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

if (!projectId || !clientEmail || !privateKey) {
    console.error('Missing Firebase credentials in .env.local');
    process.exit(1);
}

admin.initializeApp({
    credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
    }),
});

const db = admin.firestore();
const auth = admin.auth();

// Utility to delete a collection in batches
async function deleteCollection(collectionPath, batchSize = 500) {
    const collectionRef = db.collection(collectionPath);
    const query = collectionRef.orderBy('__name__').limit(batchSize);

    return new Promise((resolve, reject) => {
        deleteQueryBatch(db, query, resolve).catch(reject);
    });
}

async function deleteQueryBatch(db, query, resolve) {
    const snapshot = await query.get();
    const batchSize = snapshot.size;
    if (batchSize === 0) {
        resolve();
        return;
    }

    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
    });
    await batch.commit();

    process.nextTick(() => {
        deleteQueryBatch(db, query, resolve);
    });
}

async function wipeData() {
    console.log('--- GKS WORKFORCE DATABASE WIPE SCRIPT ---');
    console.log('Target Project:', projectId);
    console.log('Starting deletion process...\n');

    try {
        // 1. Delete all non-admin users
        console.log('1. Scanning for Staff accounts to delete...');
        const usersSnapshot = await db.collection('users').get();
        let staffDeleted = 0;

        for (const doc of usersSnapshot.docs) {
            const userData = doc.data();
            if (userData.role !== 'ADMIN') {
                const uid = doc.id;
                // Delete from Auth
                try {
                    await auth.deleteUser(uid);
                    console.log(` - Deleted Auth User: ${uid} (${userData.username || userData.name})`);
                } catch (e) {
                    if (e.code !== 'auth/user-not-found') {
                        console.error(`   Failed to delete Auth User ${uid}:`, e.message);
                    }
                }
                // Delete from Firestore
                await db.collection('users').doc(uid).delete();
                staffDeleted++;
            }
        }
        console.log(`✅ Deleted ${staffDeleted} Staff accounts (Admin kept intact).\n`);

        // 2. Clear transactional collections
        const collectionsToClear = [
            'timeRecords',
            'shifts',
            'timesheets',
            'availability',
            'auditLogs',
            'timesheetCorrections'
        ];

        console.log('2. Clearing operational collections...');
        for (const collection of collectionsToClear) {
            process.stdout.write(` - Deleting collection: ${collection}... `);
            await deleteCollection(collection);
            console.log('✅ Done');
        }

        console.log('\n==================================================');
        console.log('🎉 WIPE COMPLETE! All staff and operational noise has been cleared.');
        console.log('Your Admin account and Shop Configuration (config) remain intact.');
        console.log('==================================================\n');

    } catch (error) {
        console.error('❌ An error occurred during the wipe process:', error);
    }
}

wipeData();
