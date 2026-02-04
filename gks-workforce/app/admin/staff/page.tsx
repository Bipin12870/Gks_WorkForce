'use client';

import { useState, useEffect } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { db, auth } from '@/lib/firebase';
import { collection, addDoc, getDocs, updateDoc, doc, Timestamp } from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { User } from '@/types';
import { useRouter } from 'next/navigation';

export default function AdminStaffPage() {
    const router = useRouter();
    const [staff, setStaff] = useState<User[]>([]);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [loading, setLoading] = useState(true);
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        hourlyRate: 25,
    });
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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
        setMessage(null);

        try {
            // Create Firebase Auth user
            const userCredential = await createUserWithEmailAndPassword(
                auth,
                formData.email,
                formData.password
            );

            // Create Firestore user document
            await addDoc(collection(db, 'users'), {
                name: formData.name,
                email: formData.email,
                role: 'STAFF',
                hourlyRate: formData.hourlyRate,
                isActive: true,
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
            });

            setMessage({ type: 'success', text: 'Staff account created successfully!' });
            setFormData({ name: '', email: '', password: '', hourlyRate: 25 });
            setShowCreateForm(false);
            loadStaff();
        } catch (error: any) {
            console.error('Error creating staff:', error);
            setMessage({ type: 'error', text: error.message || 'Failed to create staff account' });
        }
    };

    const toggleStaffStatus = async (staffId: string, currentStatus: boolean) => {
        try {
            await updateDoc(doc(db, 'users', staffId), {
                isActive: !currentStatus,
                updatedAt: Timestamp.now(),
            });
            loadStaff();
            setMessage({
                type: 'success',
                text: `Staff ${!currentStatus ? 'activated' : 'deactivated'} successfully`,
            });
        } catch (error) {
            console.error('Error updating staff status:', error);
            setMessage({ type: 'error', text: 'Failed to update staff status' });
        }
    };

    const updateHourlyRate = async (staffId: string, newRate: number) => {
        try {
            await updateDoc(doc(db, 'users', staffId), {
                hourlyRate: newRate,
                updatedAt: Timestamp.now(),
            });
            loadStaff();
            setMessage({ type: 'success', text: 'Hourly rate updated successfully' });
        } catch (error) {
            console.error('Error updating hourly rate:', error);
            setMessage({ type: 'error', text: 'Failed to update hourly rate' });
        }
    };

    return (
        <ProtectedRoute requiredRole="ADMIN">
            <div className="min-h-screen bg-gray-50">
                {/* Header */}
                <header className="bg-white shadow-sm border-b">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                        <div>
                            <button
                                onClick={() => router.push('/dashboard')}
                                className="text-blue-600 hover:text-blue-700 text-sm font-medium mb-2"
                            >
                                ← Back to Dashboard
                            </button>
                            <h1 className="text-2xl font-bold text-gray-900">Staff Management</h1>
                            <p className="text-sm text-gray-600">Create and manage staff accounts</p>
                        </div>
                    </div>
                </header>

                {/* Main Content */}
                <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    {/* Message */}
                    {message && (
                        <div
                            className={`mb-6 px-4 py-3 rounded-lg ${message.type === 'success'
                                    ? 'bg-green-50 border border-green-200 text-green-700'
                                    : 'bg-red-50 border border-red-200 text-red-700'
                                }`}
                        >
                            {message.text}
                        </div>
                    )}

                    {/* Create Staff Button */}
                    <div className="mb-6">
                        <button
                            onClick={() => setShowCreateForm(!showCreateForm)}
                            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition"
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
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                                        <input
                                            type="email"
                                            value={formData.email}
                                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                            required
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Hourly Rate ($)
                                        </label>
                                        <input
                                            type="number"
                                            value={formData.hourlyRate}
                                            onChange={(e) =>
                                                setFormData({ ...formData, hourlyRate: parseFloat(e.target.value) })
                                            }
                                            required
                                            min="0"
                                            step="0.01"
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        />
                                    </div>
                                </div>
                                <button
                                    type="submit"
                                    className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition"
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
                                                Email
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
                                                    <div className="text-sm text-gray-600">{member.email}</div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <input
                                                        type="number"
                                                        value={member.hourlyRate}
                                                        onChange={(e) => updateHourlyRate(member.id, parseFloat(e.target.value))}
                                                        className="w-24 px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                                                    <button
                                                        onClick={() => toggleStaffStatus(member.id, member.isActive)}
                                                        className={`px-3 py-1 text-sm font-medium rounded-lg transition ${member.isActive
                                                                ? 'text-red-600 hover:bg-red-50'
                                                                : 'text-green-600 hover:bg-green-50'
                                                            }`}
                                                    >
                                                        {member.isActive ? 'Deactivate' : 'Activate'}
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </main>
            </div>
        </ProtectedRoute>
    );
}
