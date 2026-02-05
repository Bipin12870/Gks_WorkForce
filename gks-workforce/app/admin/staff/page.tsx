'use client';

import { useState, useEffect } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { db, auth, firebaseConfig } from '@/lib/firebase';
import { collection, setDoc, getDocs, updateDoc, doc, Timestamp } from 'firebase/firestore';
import { createUserWithEmailAndPassword, getAuth } from 'firebase/auth';
import { initializeApp, deleteApp } from 'firebase/app';
import { useNotification } from '@/contexts/NotificationContext';
import { User } from '@/types';
import { useRouter } from 'next/navigation';
import Logo from '@/components/Logo';
import { resetStaffPassword } from '@/app/actions/staff-actions';

export default function AdminStaffPage() {
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
        loadStaff();
    }, []);

    const loadStaff = async () => {
        const snapshot = await getDocs(collection(db, 'users'));
        const loadedStaff: User[] = [];
        snapshot.forEach((doc) => {
            const data = doc.data();
            if (data.role === 'STAFF') {
                loadedStaff.push({ id: doc.id, ...data } as User);
            }
        });
        setStaff(loadedStaff);
        setLoading(false);
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
            <div className="min-h-screen bg-gray-50">
                {/* Header */}
                <header className="bg-white shadow-sm border-b">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <Logo width={100} height={35} />
                                <div className="border-l pl-4">
                                    <button
                                        onClick={() => router.push('/dashboard')}
                                        className="text-blue-600 hover:text-blue-700 text-sm font-medium mb-1 block"
                                    >
                                        ← Back
                                    </button>
                                    <h1 className="text-xl font-bold text-gray-900">Staff Management</h1>
                                </div>
                            </div>
                        </div>
                    </div>
                </header>

                {/* Main Content */}
                <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

                    {/* Create Staff Button */}
                    <div className="mb-6">
                        <button
                            onClick={() => setShowCreateForm(!showCreateForm)}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition"
                        >
                            {showCreateForm ? 'Cancel' : '+ Create New Staff'}
                        </button>
                    </div>

                    {/* Create Staff Form */}
                    {showCreateForm && (
                        <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
                            <h2 className="text-lg font-semibold text-gray-900 mb-4">Create Staff Account</h2>
                            <form onSubmit={handleCreateStaff} className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Full Name
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            required
                                            className="input-base"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Username</label>
                                        <input
                                            type="text"
                                            value={formData.username}
                                            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                            required
                                            className="input-base"
                                            placeholder="e.g. john_doe (No email needed)"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Password
                                        </label>
                                        <input
                                            type="password"
                                            value={formData.password}
                                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                            required
                                            minLength={6}
                                            className="input-base"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
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
                                <button
                                    type="submit"
                                    className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-lg transition"
                                >
                                    Create Staff Account
                                </button>
                            </form>
                        </div>
                    )}

                    {/* Staff List */}
                    {loading ? (
                        <div className="flex justify-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                        </div>
                    ) : (
                        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead className="bg-gray-50 border-b">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Name
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Username
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Hourly Rate
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Status
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Actions
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                        {staff.map((member) => (
                                            <tr key={member.id}>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="font-medium text-gray-900">{member.name}</div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="text-sm text-gray-600">{member.username || member.email}</div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <input
                                                        type="number"
                                                        value={isNaN(member.hourlyRate) ? '' : member.hourlyRate}
                                                        onChange={(e) => {
                                                            const value = parseFloat(e.target.value);
                                                            if (!isNaN(value)) {
                                                                updateHourlyRate(member.id, value);
                                                            }
                                                        }}
                                                        className="w-24 px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
                                                        step="0.01"
                                                        min="0"
                                                    />
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span
                                                        className={`px-2 py-1 text-xs font-medium rounded-full ${member.isActive
                                                            ? 'bg-green-100 text-green-700'
                                                            : 'bg-red-100 text-red-700'
                                                            }`}
                                                    >
                                                        {member.isActive ? 'Active' : 'Inactive'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => openEditModal(member)}
                                                            className="text-blue-600 hover:text-blue-700 font-medium px-2 py-1"
                                                        >
                                                            Edit
                                                        </button>
                                                        <button
                                                            onClick={() => toggleStaffStatus(member.id, member.isActive)}
                                                            className={`font-medium px-2 py-1 ${member.isActive ? 'text-red-600 hover:text-red-700' : 'text-green-600 hover:text-green-700'}`}
                                                        >
                                                            {member.isActive ? 'Deactivate' : 'Activate'}
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
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                        <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
                            <h2 className="text-xl font-bold text-gray-900 mb-4">Edit Staff: {editingStaff.name}</h2>
                            <form onSubmit={handleUpdateStaff} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
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
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
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

                                <div className="border-t pt-4 mt-6">
                                    <h3 className="text-sm font-bold text-gray-900 mb-2">🔐 Reset Password</h3>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={newPassword}
                                            onChange={(e) => setNewPassword(e.target.value)}
                                            placeholder="New password"
                                            className="input-base flex-1"
                                        />
                                        <button
                                            type="button"
                                            onClick={handleResetPassword}
                                            disabled={resettingPassword || !newPassword}
                                            className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg text-sm transition font-medium disabled:opacity-50"
                                        >
                                            {resettingPassword ? '...' : 'Reset'}
                                        </button>
                                    </div>
                                    <p className="text-[10px] text-gray-500 mt-1 italic italic">
                                        * No email required. Changes are immediate.
                                    </p>
                                </div>

                                <div className="flex gap-3 pt-4 border-t mt-4">
                                    <button
                                        type="button"
                                        onClick={() => setShowEditModal(false)}
                                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition font-medium"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
                                        disabled={loading}
                                    >
                                        {loading ? 'Saving...' : 'Save Changes'}
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
