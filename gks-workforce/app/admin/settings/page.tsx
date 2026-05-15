'use client';

import { useState, useEffect } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { doc, setDoc, Timestamp } from 'firebase/firestore';
import { getShopLocation } from '@/lib/geofence';
import { ShopLocation } from '@/types';
import { useNotification } from '@/contexts/NotificationContext';
import { useRouter } from 'next/navigation';
import Logo from '@/components/Logo';

export default function AdminSettingsPage() {
    const { userData } = useAuth();
    const router = useRouter();
    const { showNotification } = useNotification();

    const [current, setCurrent] = useState<ShopLocation | null>(null);
    const [lat, setLat] = useState('');
    const [lng, setLng] = useState('');
    const [radius, setRadius] = useState('100');
    const [name, setName] = useState('GKS Shop');
    const [locating, setLocating] = useState(false);
    const [saving, setSaving] = useState(false);
    const [loadingCurrent, setLoadingCurrent] = useState(true);

    // Load existing shop location on mount
    useEffect(() => {
        (async () => {
            const loc = await getShopLocation();
            if (loc) {
                setCurrent(loc);
                setLat(String(loc.lat));
                setLng(String(loc.lng));
                setRadius(String(loc.radiusMetres));
                setName(loc.name);
            }
            setLoadingCurrent(false);
        })();
    }, []);

    // Use browser GPS to fill in coordinates
    const handleUseMyLocation = () => {
        if (!navigator.geolocation) {
            showNotification('Geolocation is not supported by your browser.', 'error');
            return;
        }
        setLocating(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setLat(String(pos.coords.latitude.toFixed(7)));
                setLng(String(pos.coords.longitude.toFixed(7)));
                setLocating(false);
                showNotification(
                    `Location captured (±${Math.round(pos.coords.accuracy)}m accuracy)`,
                    'success'
                );
            },
            (err) => {
                setLocating(false);
                showNotification(
                    `Could not get location: ${err.message}. Enter coordinates manually.`,
                    'error'
                );
            },
            { enableHighAccuracy: true, timeout: 10_000 }
        );
    };

    const handleSave = async () => {
        if (!userData) return;

        const parsedLat = parseFloat(lat);
        const parsedLng = parseFloat(lng);
        const parsedRadius = parseInt(radius, 10);

        if (isNaN(parsedLat) || parsedLat < -90 || parsedLat > 90) {
            showNotification('Latitude must be a number between -90 and 90.', 'error');
            return;
        }
        if (isNaN(parsedLng) || parsedLng < -180 || parsedLng > 180) {
            showNotification('Longitude must be a number between -180 and 180.', 'error');
            return;
        }
        if (isNaN(parsedRadius) || parsedRadius < 10 || parsedRadius > 2000) {
            showNotification('Radius must be between 10 and 2000 metres.', 'error');
            return;
        }
        if (!name.trim()) {
            showNotification('Please enter a name for the location.', 'error');
            return;
        }

        setSaving(true);
        try {
            const payload: ShopLocation = {
                lat: parsedLat,
                lng: parsedLng,
                radiusMetres: parsedRadius,
                name: name.trim(),
                setAt: Timestamp.now(),
                setBy: userData.id,
            };

            await setDoc(doc(db, 'config', 'shopLocation'), payload);
            setCurrent(payload);
            showNotification('Shop location saved successfully!', 'success');
        } catch (err) {
            console.error('Error saving shop location:', err);
            showNotification('Failed to save location. Please try again.', 'error');
        } finally {
            setSaving(false);
        }
    };

    const radiusNum = parseInt(radius, 10) || 100;

    return (
        <ProtectedRoute requiredRole="ADMIN">
            <div className="min-h-screen bg-background text-gray-900">
                {/* Header */}
                <header className="bg-white border-b border-gray-200">
                    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                        <div className="flex items-center gap-6">
                            <Logo width={100} height={35} />
                            <div className="border-l border-gray-200 pl-6">
                                <button
                                    onClick={() => router.push('/dashboard')}
                                    className="text-blue-600 hover:text-blue-700 text-xs font-bold uppercase tracking-wider mb-0.5 block transition-colors"
                                >
                                    ← Dashboard
                                </button>
                                <h1 className="text-xl font-bold text-gray-900 tracking-tight">
                                    Settings
                                </h1>
                            </div>
                        </div>
                    </div>
                </header>

                <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

                    {/* Current Status Banner */}
                    {!loadingCurrent && (
                        <div className={`rounded-xl border px-5 py-4 flex items-center gap-3 ${
                            current
                                ? 'bg-green-50 border-green-100'
                                : 'bg-amber-50 border-amber-100'
                        }`}>
                            <span className="text-lg">{current ? '📍' : '⚠️'}</span>
                            <div>
                                {current ? (
                                    <>
                                        <p className="text-xs font-black uppercase tracking-widest text-green-700">
                                            Shop Location Active
                                        </p>
                                        <p className="text-sm font-semibold text-green-800 mt-0.5">
                                            {current.name} — {current.lat.toFixed(5)}, {current.lng.toFixed(5)} · {current.radiusMetres}m radius
                                        </p>
                                    </>
                                ) : (
                                    <>
                                        <p className="text-xs font-black uppercase tracking-widest text-amber-700">
                                            No Shop Location Set
                                        </p>
                                        <p className="text-sm font-semibold text-amber-800 mt-0.5">
                                            Staff cannot use GPS clock-in until a location is configured.
                                        </p>
                                    </>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Shop Location Card */}
                    <div className="card-base p-6">
                        <div className="mb-6">
                            <h2 className="text-base font-black text-gray-900 uppercase tracking-widest">
                                Shop / Work Location
                            </h2>
                            <p className="text-sm text-gray-500 mt-1">
                                Staff must be within the set radius to clock in. Set this to your current
                                location for testing, or enter the shop coordinates manually.
                            </p>
                        </div>

                        {/* Use My Location Button */}
                        <div className="mb-6">
                            <button
                                onClick={handleUseMyLocation}
                                disabled={locating}
                                className="flex items-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-black uppercase tracking-widest rounded-xl transition-all shadow-sm hover:shadow-md active:scale-[0.98]"
                            >
                                {locating ? (
                                    <>
                                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                        </svg>
                                        Getting Location...
                                    </>
                                ) : (
                                    <>
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                                        </svg>
                                        Use My Current Location
                                    </>
                                )}
                            </button>
                            <p className="text-xs text-gray-400 mt-2">
                                Browser will ask for location permission. Use this while at the shop, or use it at home/office for testing.
                            </p>
                        </div>

                        {/* Divider */}
                        <div className="flex items-center gap-3 mb-6">
                            <div className="flex-1 h-px bg-gray-100" />
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">or enter manually</span>
                            <div className="flex-1 h-px bg-gray-100" />
                        </div>

                        {/* Coordinate Inputs */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                            <div>
                                <label className="block text-xs font-black text-gray-600 uppercase tracking-wider mb-2">
                                    Latitude
                                </label>
                                <input
                                    type="number"
                                    step="0.0000001"
                                    min="-90"
                                    max="90"
                                    value={lat}
                                    onChange={(e) => setLat(e.target.value)}
                                    placeholder="e.g. -34.9285"
                                    className="input-base"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-black text-gray-600 uppercase tracking-wider mb-2">
                                    Longitude
                                </label>
                                <input
                                    type="number"
                                    step="0.0000001"
                                    min="-180"
                                    max="180"
                                    value={lng}
                                    onChange={(e) => setLng(e.target.value)}
                                    placeholder="e.g. 138.6007"
                                    className="input-base"
                                />
                            </div>
                        </div>

                        {/* Location Name */}
                        <div className="mb-6">
                            <label className="block text-xs font-black text-gray-600 uppercase tracking-wider mb-2">
                                Location Name
                            </label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="e.g. GKS Shop"
                                className="input-base"
                            />
                        </div>

                        {/* Radius Slider */}
                        <div className="mb-8">
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-xs font-black text-gray-600 uppercase tracking-wider">
                                    Geofence Radius
                                </label>
                                <span className="text-sm font-black text-blue-600 tabular-nums">
                                    {radiusNum}m
                                </span>
                            </div>
                            <input
                                type="range"
                                min="10"
                                max="500"
                                step="10"
                                value={radius}
                                onChange={(e) => setRadius(e.target.value)}
                                className="w-full h-2 bg-gray-200 rounded-full appearance-none cursor-pointer accent-blue-600"
                            />
                            <div className="flex justify-between text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-1">
                                <span>10m</span>
                                <span>Recommended: 100m</span>
                                <span>500m</span>
                            </div>

                            {/* Visual radius indicator */}
                            <div className="mt-4 flex justify-center">
                                <div className="relative flex items-center justify-center" style={{ width: 120, height: 120 }}>
                                    {/* Outer ring — max radius */}
                                    <div className="absolute inset-0 rounded-full border-2 border-dashed border-gray-100" />
                                    {/* Inner ring — proportional radius */}
                                    <div
                                        className="absolute rounded-full border-2 border-blue-300 bg-blue-50/50 transition-all duration-300"
                                        style={{
                                            width: `${Math.max(16, Math.min(100, (radiusNum / 500) * 100))}%`,
                                            height: `${Math.max(16, Math.min(100, (radiusNum / 500) * 100))}%`,
                                        }}
                                    />
                                    {/* Shop dot */}
                                    <div className="relative w-3 h-3 rounded-full bg-blue-600 shadow z-10" />
                                </div>
                            </div>
                            <p className="text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-1">
                                {radiusNum}m radius from shop
                            </p>
                        </div>

                        {/* Save Button */}
                        <button
                            onClick={handleSave}
                            disabled={saving || !lat || !lng}
                            className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white text-sm font-black uppercase tracking-widest rounded-xl transition-all shadow-sm hover:shadow-md active:scale-[0.99] disabled:cursor-not-allowed"
                        >
                            {saving ? 'Saving...' : 'Save Shop Location'}
                        </button>
                    </div>

                    {/* Info Card */}
                    <div className="card-base p-5 bg-gray-50/50">
                        <h3 className="text-xs font-black uppercase tracking-widest text-gray-500 mb-3">
                            How Geofencing Works
                        </h3>
                        <ul className="space-y-2 text-sm text-gray-600">
                            <li className="flex items-start gap-2">
                                <span className="text-green-500 mt-0.5">✓</span>
                                Staff must be within <strong>{radiusNum}m</strong> of this location to clock in
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-blue-500 mt-0.5">↻</span>
                                Times are rounded to the nearest 5 minutes automatically
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-amber-500 mt-0.5">⚠</span>
                                If staff clock out from outside the radius, their rostered end time is used instead
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-gray-400 mt-0.5">🕐</span>
                                Shifts are auto-closed 30 minutes after the rostered end time if staff forget to clock out
                            </li>
                        </ul>
                    </div>

                </main>
            </div>
        </ProtectedRoute>
    );
}
