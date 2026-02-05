'use client';

import { useState, useEffect } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { db, auth, firebaseConfig } from '@/lib/firebase';
import { collection, setDoc, getDocs, updateDoc, doc, Timestamp, query, where, writeBatch, deleteDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword, getAuth } from 'firebase/auth';
import { initializeApp, deleteApp } from 'firebase/app';
import { useNotification } from '@/contexts/NotificationContext';
import { User } from '@/types';
import { useRouter } from 'next/navigation';
import Logo from '@/components/Logo';
import { resetStaffPassword, deleteStaffAccount } from '@/app/actions/staff-actions';

export default function AdminStaffPage() {
    const { userData } = useAuth();
    const router = useRouter();
    const [staff, setStaff] = useState<User[]>([]);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [loading, setLoading] = useState(true);
    const [formData, setFormData] = useState({
        name: '',
        username: '',
        password: '',
        hourlyRate: 25,
    });
    const [editingStaff, setEditingStaff] = useState<User | null>(null);
    const [showEditModal, setShowEditModal] = useState(false);
    const [editFormData, setEditFormData] = useState({
        name: '',
        hourlyRate: 0,
    });
    const [newPassword, setNewPassword] = useState('');
    const [resettingPassword, setResettingPassword] = useState(false);
    const { showNotification } = useNotification();

    useEffect(() => {
        if (userData?.role === 'ADMIN') {
            loadStaff();
        }
    }, [userData]);

    const loadStaff = async () => {
        if (!userData || userData.role !== 'ADMIN') return;
        try {
            const snapshot = await getDocs(collection(db, 'users'));
            const loadedStaff: User[] = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                if (data.role === 'STAFF') {
                    loadedStaff.push({ id: doc.id, ...data } as User);
                }
            });
            setStaff(loadedStaff);
        } catch (error) {
            console.error('Error loading staff:', error);
            showNotification('Failed to load staff list.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleCreateStaff = async (e: React.FormEvent) => {
        e.preventDefault();

        try {
            // Construct dummy email for staff username
            const dummyEmail = `${formData.username.trim()}@gks.internal`;

            // Create a secondary Firebase app to create the user without signing out the admin
            const tempAppName = `temp-app-${Date.now()}`;
            const tempApp = initializeApp(firebaseConfig, tempAppName);
            const tempAuth = getAuth(tempApp);

            // Create Firebase Auth user using the temporary auth instance
            const userCredential = await createUserWithEmailAndPassword(
                tempAuth,
                dummyEmail,
                formData.password
            );

            const newUser = userCredential.user;

            // Create Firestore user document using the main db instance
            // We use setDoc with the UID as the document ID to ensure isOwner rules work
            await setDoc(doc(db, 'users', newUser.uid), {
                name: formData.name,
                email: dummyEmail,
                username: formData.username.trim(),
                role: 'STAFF',
                hourlyRate: formData.hourlyRate,
                isActive: true,
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
            });

            // Clean up the temporary app
            await deleteApp(tempApp);

            showNotification('Staff account created successfully!', 'success');
            setFormData({ name: '', username: '', password: '', hourlyRate: 25 });
            setShowCreateForm(false);
            loadStaff();
        } catch (error: any) {
            console.error('Error creating staff:', error);
            showNotification(error.message || 'Failed to create staff account', 'error');
        }
    };

    const toggleStaffStatus = async (staffId: string, currentStatus: boolean) => {
        try {
            await updateDoc(doc(db, 'users', staffId), {
                isActive: !currentStatus,
                updatedAt: Timestamp.now(),
            });
            loadStaff();
            showNotification(`Staff ${!currentStatus ? 'activated' : 'deactivated'} successfully`, 'success');
        } catch (error) {
            console.error('Error updating staff status:', error);
            showNotification('Failed to update staff status', 'error');
        }
    };

    const updateHourlyRate = async (staffId: string, newRate: number) => {
        try {
            await updateDoc(doc(db, 'users', staffId), {
                hourlyRate: newRate,
                updatedAt: Timestamp.now(),
            });
            loadStaff();
            showNotification('Hourly rate updated successfully', 'success');
        } catch (error) {
            console.error('Error updating hourly rate:', error);
            showNotification('Failed to update hourly rate', 'error');
        }
    };

    const handleUpdateStaff = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingStaff) return;

        try {
            setLoading(true);
            await updateDoc(doc(db, 'users', editingStaff.id), {
                name: editFormData.name,
                hourlyRate: editFormData.hourlyRate,
                updatedAt: Timestamp.now(),
            });

            showNotification('Staff updated successfully!', 'success');
            setShowEditModal(false);
            setEditingStaff(null);
            loadStaff();
        } catch (error: any) {
            console.error('Error updating staff:', error);
            showNotification(error.message || 'Failed to update staff', 'error');
        } finally {
            setLoading(false);
        }
    };

    const openEditModal = (member: User) => {
        setEditingStaff(member);
        setEditFormData({
            name: member.name,
            hourlyRate: member.hourlyRate,
        });
        setShowEditModal(true);
    };

    const handleDeleteStaff = async (staffId: string, staffName: string) => {
        const confirmed = window.confirm(
            `CRITICAL WARNING: You are about to PERMANENTLY delete ${staffName} and ALL their associated data (shifts, availability, clock-in history).\n\nThis action is IRREVERSIBLE. Are you absolutely sure?`
        );

        if (!confirmed) return;

        const secondConfirmation = window.confirm(
            `FINAL WARNING: All historical payroll and roster data for ${staffName} will be purged. Type 'DELETE' in your mind and press OK to continue.`
        );

        if (!secondConfirmation) return;

        try {
            setLoading(true);
            const batch = writeBatch(db);

            // 1. Delete all shifts
            const shiftsQuery = query(collection(db, 'shifts'), where('staffId', '==', staffId));
            const shiftsSnapshot = await getDocs(shiftsQuery);
            shiftsSnapshot.forEach((doc) => batch.delete(doc.ref));

            // 2. Delete all availability
            const availabilityQuery = query(collection(db, 'availability'), where('staffId', '==', staffId));
            const availabilitySnapshot = await getDocs(availabilityQuery);
            availabilitySnapshot.forEach((doc) => batch.delete(doc.ref));

            // 3. Delete all time records
            const timeRecordsQuery = query(collection(db, 'timeRecords'), where('staffId', '==', staffId));
            const timeRecordsSnapshot = await getDocs(timeRecordsQuery);
            timeRecordsSnapshot.forEach((doc) => batch.delete(doc.ref));

            // 4. Delete all roster audit logs
            const auditLogsQuery = query(collection(db, 'rosterAuditLogs'), where('staffId', '==', staffId));
            const auditLogsSnapshot = await getDocs(auditLogsQuery);
            auditLogsSnapshot.forEach((doc) => batch.delete(doc.ref));

            // 5. Delete the user document in Firestore
            batch.delete(doc(db, 'users', staffId));

            // 6. Delete the Firebase Auth account using Server Action
            const authDeleteResult = await deleteStaffAccount(staffId);
            if (!authDeleteResult.success) {
                console.warn('Auth account could not be deleted automatically:', authDeleteResult.error);
                // We still proceed with the batch commit for data pruning
            }

            // Commit the batch
            await batch.commit();

            showNotification(`${staffName} and all associated data have been permanently deleted.`, 'success');
            loadStaff();
        } catch (error: any) {
            console.error('Error deleting staff:', error);
            showNotification(error.message || 'Failed to delete staff and data', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleResetPassword = async () => {
        if (!editingStaff || !newPassword) return;
        if (newPassword.length < 6) {
            showNotification('Password must be at least 6 characters', 'error');
            return;
        }

        try {
            setResettingPassword(true);
            const result = await resetStaffPassword(editingStaff.id, newPassword);

            if (result.success) {
                showNotification('Password reset successfully!', 'success');
                setNewPassword('');
            } else {
                throw new Error(result.error);
            }
        } catch (error: any) {
            console.error('Error resetting password:', error);
            showNotification(error.message || 'Failed to reset password', 'error');
        } finally {
            setResettingPassword(false);
        }
    };

    return (
        <ProtectedRoute requiredRole="ADMIN">
            <div className="min-h-screen bg-background">
                {/* Header */}
                <header className="bg-white border-b border-gray-200">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-6">
                                <Logo width={100} height={35} />
                                <div className="border-l border-gray-200 pl-6">
                                    <button
                                        onClick={() => router.push('/dashboard')}
                                        className="text-blue-600 hover:text-blue-700 text-xs font-bold uppercase tracking-wider mb-0.5 block transition-colors"
                                    >
                                        ← Dashboard
                                    </button>
                                    <h1 className="text-xl font-bold text-gray-900 tracking-tight">Staff Management</h1>
                                </div>
                            </div>
                        </div>
                    </div>
                </header>

                {/* Main Content */}
                <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

                    {/* Create Staff Button */}
                    <div className="mb-8">
                        <button
                            onClick={() => setShowCreateForm(!showCreateForm)}
                            className={showCreateForm ? "btn-secondary" : "btn-primary"}
                        >
                            {showCreateForm ? 'Cancel Creation' : '+ Add New Staff Member'}
                        </button>
                    </div>

                    {/* Create Staff Form */}
                    {showCreateForm && (
                        <div className="card-base p-8 mb-8 border-blue-100 bg-blue-50/10">
                            <h2 className="text-lg font-bold text-gray-900 mb-6">Create Staff Account</h2>
                            <form onSubmit={handleCreateStaff} className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                                            Full Name
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            required
                                            className="input-base"
                                            placeholder="John Doe"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Username</label>
                                        <input
                                            type="text"
                                            value={formData.username}
                                            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                            required
                                            className="input-base"
                                            placeholder="johndoe"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                                            Initial Password
                                        </label>
                                        <input
                                            type="password"
                                            value={formData.password}
                                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                            required
                                            minLength={6}
                                            className="input-base"
                                            placeholder="••••••••"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                                            Hourly Rate ($)
                                        </label>
                                        <input
                                            type="number"
                                            value={isNaN(formData.hourlyRate) ? '' : formData.hourlyRate}
                                            onChange={(e) => {
                                                const value = parseFloat(e.target.value);
                                                setFormData({ ...formData, hourlyRate: isNaN(value) ? 0 : value });
                                            }}
                                            required
                                            min="0"
                                            step="0.01"
                                            className="input-base"
                                        />
                                    </div>
                                </div>
                                <div className="flex justify-end pt-2">
                                    <button
                                        type="submit"
                                        className="btn-primary px-8"
                                    >
                                        Create Account
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}

                    {/* Staff List */}
                    {loading ? (
                        <div className="flex justify-center py-20">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                        </div>
                    ) : (
                        <div className="card-base">
                            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                                <h3 className="font-bold text-gray-900">Active Staff Directory</h3>
                                <span className="text-xs font-medium text-gray-500">{staff.length} Members</span>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="bg-gray-50/50">
                                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                                                Staff Member
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                                                Username / Login
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                                                Hourly Rate
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                                                Acc. Status
                                            </th>
                                            <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                                                Management
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {staff.map((member) => (
                                            <tr key={member.id} className="hover:bg-gray-50/80 transition-colors group">
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="font-semibold text-gray-900">{member.name}</div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="text-sm text-gray-500 font-medium">{member.username || member.email}</div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-gray-400 text-sm">$</span>
                                                        <input
                                                            type="number"
                                                            value={isNaN(member.hourlyRate) ? '' : member.hourlyRate}
                                                            onChange={(e) => {
                                                                const value = parseFloat(e.target.value);
                                                                if (!isNaN(value)) {
                                                                    updateHourlyRate(member.id, value);
                                                                }
                                                            }}
                                                            className="w-20 px-2 py-1 bg-transparent border border-transparent hover:border-gray-200 focus:border-blue-500 focus:bg-white rounded transition-all text-sm font-semibold text-gray-900 outline-none"
                                                            step="0.01"
                                                            min="0"
                                                        />
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span
                                                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold tracking-tight uppercase ${member.isActive
                                                            ? 'bg-green-50 text-green-700'
                                                            : 'bg-red-50 text-red-700'
                                                            }`}
                                                    >
                                                        {member.isActive ? 'Active' : 'Inactive'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-right">
                                                    <div className="flex justify-end gap-3 opacity-60 group-hover:opacity-100 transition-opacity">
                                                        <button
                                                            onClick={() => openEditModal(member)}
                                                            className="btn-ghost-primary"
                                                        >
                                                            Edit
                                                        </button>
                                                        <button
                                                            onClick={() => toggleStaffStatus(member.id, member.isActive)}
                                                            className={member.isActive ? "btn-ghost-danger" : "btn-ghost-primary"}
                                                        >
                                                            {member.isActive ? 'Deactivate' : 'Activate'}
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteStaff(member.id, member.name)}
                                                            className="p-2 text-red-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                                            title="Permanently Delete Staff"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                                                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </main>

                {/* Edit Modal */}
                {showEditModal && editingStaff && (
                    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
                        <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-gray-200 overflow-hidden">
                            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                                <h2 className="text-lg font-bold text-gray-900 tracking-tight">Modify {editingStaff.name}</h2>
                                <button onClick={() => setShowEditModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                    </svg>
                                </button>
                            </div>
                            <form onSubmit={handleUpdateStaff} className="p-6 space-y-6">
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                                        Full Name
                                    </label>
                                    <input
                                        type="text"
                                        value={editFormData.name}
                                        onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                                        required
                                        className="input-base"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                                        Hourly Rate ($)
                                    </label>
                                    <input
                                        type="number"
                                        value={editFormData.hourlyRate}
                                        onChange={(e) => setEditFormData({ ...editFormData, hourlyRate: parseFloat(e.target.value) })}
                                        required
                                        min="0"
                                        step="0.01"
                                        className="input-base"
                                    />
                                </div>

                                <div className="bg-amber-50/50 p-4 rounded-lg border border-amber-100">
                                    <h3 className="text-xs font-bold text-amber-900 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                                        </svg>
                                        Security: Assign New Password
                                    </h3>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={newPassword}
                                            onChange={(e) => setNewPassword(e.target.value)}
                                            placeholder="Assign new password"
                                            className="input-base flex-1 bg-white"
                                        />
                                        <button
                                            type="button"
                                            onClick={handleResetPassword}
                                            disabled={resettingPassword || !newPassword}
                                            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold tracking-tight uppercase transition-all disabled:opacity-50"
                                        >
                                            {resettingPassword ? '...' : 'Reset'}
                                        </button>
                                    </div>
                                    <p className="text-[10px] text-amber-700/60 mt-2 font-medium">
                                        * Login using username + new password. No email needed.
                                    </p>
                                </div>

                                <div className="flex gap-3 pt-4 border-t border-gray-100">
                                    <button
                                        type="button"
                                        onClick={() => setShowEditModal(false)}
                                        className="btn-secondary flex-1"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="btn-primary flex-1"
                                        disabled={loading}
                                    >
                                        {loading ? 'Updating...' : 'Save Changes'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </ProtectedRoute>
    );
}
