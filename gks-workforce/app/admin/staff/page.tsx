'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { useNotification } from '@/contexts/NotificationContext';
import { User } from '@/types';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import Accordion from '@/components/ui/Accordion';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Spinner from '@/components/ui/Spinner';
import AdminDataTable, { AdminTableHead, AdminTableTh, AdminTableBody, AdminTableRow, AdminTableTd } from '@/components/admin/AdminDataTable';
import AdminFormModal, { AdminModalFooter } from '@/components/admin/AdminFormModal';
import { UserPlus } from 'lucide-react';
import { createStaffAccount, updateStaffProfile, toggleStaffActive, resetStaffPassword, deleteStaffAccountFull } from '@/app/actions/staff';

export default function AdminStaffPage() {
    const { userData } = useAuth();
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
    const [showCreatePassword, setShowCreatePassword] = useState(false);
    const [showResetPassword, setShowResetPassword] = useState(false);
    const [resettingPassword, setResettingPassword] = useState(false);
    const { showNotification } = useNotification();

    const loadStaff = useCallback(async () => {
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
            showNotification((error as Error).message || 'Failed to load staff list.', 'error');
        } finally {
            setLoading(false);
        }
    }, [userData, showNotification]);

    useEffect(() => {
        if (userData?.role === 'ADMIN') {
            loadStaff();
        }
    }, [userData, loadStaff]);

    const handleCreateStaff = async (e: React.FormEvent) => {
        e.preventDefault();

        try {
            await createStaffAccount(
                formData.username,
                formData.password,
                formData.name,
                formData.hourlyRate
            );

            showNotification('Staff account created successfully!', 'success');
            setFormData({ name: '', username: '', password: '', hourlyRate: 25 });
            setShowCreateForm(false);
            loadStaff();
        } catch (error) {
            console.error('Error creating staff:', error);
            showNotification((error as Error).message || 'Failed to create staff account', 'error');
        }
    };

    const toggleStaffStatus = async (staffId: string, currentStatus: boolean) => {
        try {
            await toggleStaffActive(staffId, currentStatus);
            loadStaff();
            showNotification(`Staff ${!currentStatus ? 'activated' : 'deactivated'} successfully`, 'success');
        } catch (error) {
            console.error('Error updating staff status:', error);
            showNotification((error as Error).message || 'Failed to update staff status', 'error');
        }
    };

    const updateHourlyRate = async (staffMember: User, newRate: number) => {
        try {
            await updateStaffProfile(staffMember.id, staffMember.name, newRate);
            loadStaff();
            showNotification('Hourly rate updated successfully', 'success');
        } catch (error) {
            console.error('Error updating hourly rate:', error);
            showNotification((error as Error).message || 'Failed to update hourly rate', 'error');
        }
    };

    const handleUpdateStaff = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingStaff) return;

        try {
            setLoading(true);
            await updateStaffProfile(editingStaff.id, editFormData.name, editFormData.hourlyRate);

            showNotification('Staff updated successfully!', 'success');
            setShowEditModal(false);
            setEditingStaff(null);
            loadStaff();
        } catch (error) {
            console.error('Error updating staff:', error);
            showNotification((error as Error).message || 'Failed to update staff', 'error');
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
            await deleteStaffAccountFull(staffId);

            showNotification(`${staffName} and all associated data have been permanently deleted.`, 'success');
            loadStaff();
        } catch (error) {
            console.error('Error deleting staff:', error);
            showNotification((error as Error).message || 'Failed to delete staff and data', 'error');
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
            await resetStaffPassword(editingStaff.id, newPassword);
            showNotification('Password reset successfully!', 'success');
            setNewPassword('');
        } catch (error) {
            console.error('Error resetting password:', error);
            showNotification((error as Error).message || 'Failed to reset password', 'error');
        } finally {
            setResettingPassword(false);
        }
    };

    return (
        <>
            <AdminPageHeader
                actions={
                    <Button
                        variant={showCreateForm ? 'secondary' : 'primary'}
                        size="sm"
                        onClick={() => setShowCreateForm(!showCreateForm)}
                    >
                        <UserPlus className="w-4 h-4" />
                        {showCreateForm ? 'Cancel' : 'Add staff'}
                    </Button>
                }
            />

            {showCreateForm && (
                <div className="mb-6">
                    <Accordion
                        items={[
                            {
                                id: 'create',
                                title: 'New staff account',
                                description: 'Creates login and Firestore profile',
                                defaultOpen: true,
                                content: (
                            <form onSubmit={handleCreateStaff} className="space-y-6 pt-2">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
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
                                        <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">Username</label>
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
                                        <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
                                            Initial Password
                                        </label>
                                        <div className="relative">
                                            <input
                                                type={showCreatePassword ? "text" : "password"}
                                                value={formData.password}
                                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                                required
                                                minLength={6}
                                                className="input-base pr-10"
                                                placeholder="••••••••"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowCreatePassword(!showCreatePassword)}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                                            >
                                                {showCreatePassword ? (
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                                                    </svg>
                                                ) : (
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                    </svg>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
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
                                    <Button type="submit" variant="primary">Create account</Button>
                                </div>
                            </form>
                                ),
                            },
                        ]}
                    />
                </div>
            )}

                    {loading ? (
                        <Spinner className="py-20" />
                    ) : (
                        <div className="admin-section-card">
                            <div className="admin-section-card-header">
                                <h3 className="text-section-title">Active directory</h3>
                                <span className="text-label">{staff.length} members</span>
                            </div>
                            <AdminDataTable isEmpty={staff.length === 0} emptyMessage="No staff members yet">
                                    <AdminTableHead>
                                            <AdminTableTh>Staff</AdminTableTh>
                                            <AdminTableTh>Login</AdminTableTh>
                                            <AdminTableTh>Rate</AdminTableTh>
                                            <AdminTableTh>Status</AdminTableTh>
                                            <AdminTableTh align="right">Actions</AdminTableTh>
                                    </AdminTableHead>
                                    <AdminTableBody>
                                        {staff.map((member) => (
                                            <AdminTableRow key={member.id}>
                                                <AdminTableTd>
                                                    <div className="font-semibold text-gray-900">{member.name}</div>
                                                </AdminTableTd>
                                                <AdminTableTd>
                                                    <div className="text-sm text-gray-500">{member.username || member.email}</div>
                                                </AdminTableTd>
                                                <AdminTableTd>
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-gray-400 text-sm">$</span>
                                                        <input
                                                            type="number"
                                                            value={isNaN(member.hourlyRate) ? '' : member.hourlyRate}
                                                            onChange={(e) => {
                                                                const value = parseFloat(e.target.value);
                                                                if (!isNaN(value)) {
                                                                    updateHourlyRate(member, value);
                                                                }
                                                            }}
                                                            className="w-20 px-2 py-1 bg-transparent border border-transparent hover:border-gray-200 focus:border-blue-500 focus:bg-white rounded transition-all text-sm font-semibold text-gray-900 outline-none"
                                                            step="0.01"
                                                            min="0"
                                                        />
                                                    </div>
                                                </AdminTableTd>
                                                <AdminTableTd>
                                                    <Badge variant={member.isActive ? 'success' : 'danger'}>
                                                        {member.isActive ? 'Active' : 'Inactive'}
                                                    </Badge>
                                                </AdminTableTd>
                                                <AdminTableTd align="right">
                                                    <div className="flex justify-end gap-2 flex-wrap">
                                                        <Button variant="ghost-primary" size="sm" onClick={() => openEditModal(member)}>Edit</Button>
                                                        <Button
                                                            variant={member.isActive ? 'ghost-danger' : 'ghost-primary'}
                                                            size="sm"
                                                            onClick={() => toggleStaffStatus(member.id, member.isActive)}
                                                        >
                                                            {member.isActive ? 'Deactivate' : 'Activate'}
                                                        </Button>
                                                        <Button
                                                            variant="ghost-danger"
                                                            size="sm"
                                                            onClick={() => handleDeleteStaff(member.id, member.name)}
                                                            aria-label="Delete staff"
                                                        >
                                                            Delete
                                                        </Button>
                                                    </div>
                                                </AdminTableTd>
                                            </AdminTableRow>
                                        ))}
                                    </AdminTableBody>
                            </AdminDataTable>
                        </div>
                    )}

            <AdminFormModal
                open={showEditModal && !!editingStaff}
                onClose={() => setShowEditModal(false)}
                title={editingStaff ? `Edit ${editingStaff.name}` : 'Edit staff'}
                footer={
                    <AdminModalFooter
                        onCancel={() => setShowEditModal(false)}
                        onPrimary={() =>
                            (document.getElementById('staff-edit-form') as HTMLFormElement | null)?.requestSubmit()
                        }
                        primaryLabel={loading ? 'Saving…' : 'Save changes'}
                        primaryDisabled={loading}
                    />
                }
            >
                {editingStaff && (
                            <form id="staff-edit-form" onSubmit={handleUpdateStaff} className="space-y-6">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
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
                                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
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
                                    <h3 className="text-xs font-semibold text-amber-900 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                                        </svg>
                                        Security: Assign New Password
                                    </h3>
                                    <div className="flex gap-2">
                                        <div className="relative flex-1">
                                            <input
                                                type={showResetPassword ? "text" : "password"}
                                                value={newPassword}
                                                onChange={(e) => setNewPassword(e.target.value)}
                                                placeholder="Assign new password"
                                                className="input-base w-full bg-white pr-10"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowResetPassword(!showResetPassword)}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                                            >
                                                {showResetPassword ? (
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                                                    </svg>
                                                ) : (
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                    </svg>
                                                )}
                                            </button>
                                        </div>
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            size="sm"
                                            onClick={handleResetPassword}
                                            disabled={resettingPassword || !newPassword}
                                        >
                                            {resettingPassword ? '…' : 'Reset password'}
                                        </Button>
                                    </div>
                                    <p className="text-[10px] text-amber-700/60 mt-2 font-medium">
                                        * Login using username + new password. No email needed.
                                    </p>
                                </div>

                            </form>
                )}
            </AdminFormModal>
        </>
    );
}
