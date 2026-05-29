'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { saveShopLocation, saveAvailabilitySettings } from '@/app/actions/settings';
import { getShopLocation } from '@/lib/geofence';
import { ShopLocation } from '@/types';
import { useNotification } from '@/contexts/NotificationContext';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import Button from '@/components/ui/Button';
import Icon from '@/components/ui/Icon';
import { MapPin, AlertTriangle, LocateFixed, SplitSquareVertical } from 'lucide-react';

export default function AdminSettingsPage() {
    const { userData } = useAuth();
    const { showNotification } = useNotification();

    const [current, setCurrent] = useState<ShopLocation | null>(null);
    const [lat, setLat] = useState('');
    const [lng, setLng] = useState('');
    const [radius, setRadius] = useState('100');
    const [name, setName] = useState('GKS Shop');
    const [locating, setLocating] = useState(false);
    const [saving, setSaving] = useState(false);
    const [loadingCurrent, setLoadingCurrent] = useState(true);
    const [allowMultipleRanges, setAllowMultipleRanges] = useState(false);
    const [savingRangeToggle, setSavingRangeToggle] = useState(false);

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
                setAllowMultipleRanges(loc.allowMultipleAvailabilityRanges ?? false);
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
            await saveShopLocation(parsedLat, parsedLng, parsedRadius, name);
            const updated = { lat: parsedLat, lng: parsedLng, radiusMetres: parsedRadius, name: name.trim() };
            setCurrent(updated as any);
            showNotification('Shop location saved successfully!', 'success');
        } catch (err) {
            console.error('Error saving shop location:', err);
            showNotification((err as Error).message || 'Failed to save location. Please try again.', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleRangeToggle = async (value: boolean) => {
        setAllowMultipleRanges(value);
        setSavingRangeToggle(true);
        try {
            await saveAvailabilitySettings(value);
            showNotification(
                value ? 'Multiple ranges enabled for staff.' : 'Multiple ranges disabled — staff will use a single range per day.',
                'success'
            );
        } catch (err) {
            setAllowMultipleRanges(!value); // revert on error
            showNotification((err as Error).message || 'Failed to save setting.', 'error');
        } finally {
            setSavingRangeToggle(false);
        }
    };

    const radiusNum = parseInt(radius, 10) || 100;

    return (
        <div className="max-w-4xl mx-auto w-full space-y-8">
            <AdminPageHeader
                title="Settings"
                description="Shop location, geofence radius, and clock-in policies."
            />

                    {/* Current Status Banner */}
                    {!loadingCurrent && (
                        <div className={`rounded-xl border px-5 py-4 flex items-center gap-3 ${current
                                ? 'bg-green-50 border-green-100'
                                : 'bg-amber-50 border-amber-100'
                            }`}>
                            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${current ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                <Icon icon={current ? MapPin : AlertTriangle} size="md" />
                            </span>
                            <div>
                                {current ? (
                                    <>
                                        <p className="admin-kicker text-green-700">
                                            Shop location active
                                        </p>
                                        <p className="text-sm font-semibold text-green-800 mt-0.5">
                                            {current.name} — {current.lat.toFixed(5)}, {current.lng.toFixed(5)} · {current.radiusMetres}m radius
                                        </p>
                                    </>
                                ) : (
                                    <>
                                        <p className="admin-kicker text-amber-700">
                                            No shop location set
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
                    <div className="admin-section-card p-6">
                        <div className="mb-6">
                            <h2 className="text-section-title">
                                Shop / work location
                            </h2>
                            <p className="text-sm text-gray-500 mt-1">
                                Staff must be within the set radius to clock in. Set this to your current
                                location for testing, or enter the shop coordinates manually.
                            </p>
                        </div>

                        {/* Use My Location Button */}
                        <div className="mb-6">
                            <Button
                                variant="primary"
                                onClick={handleUseMyLocation}
                                disabled={locating}
                            >
                                <Icon icon={LocateFixed} size="sm" />
                                {locating ? 'Getting location…' : 'Use my current location'}
                            </Button>
                            <p className="text-xs text-gray-400 mt-2">
                                Browser will ask for location permission. Use this while at the shop, or use it at home/office for testing.
                            </p>
                        </div>

                        {/* Divider */}
                        <div className="flex items-center gap-3 mb-6">
                            <div className="flex-1 h-px bg-gray-100" />
                            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">or enter manually</span>
                            <div className="flex-1 h-px bg-gray-100" />
                        </div>

                        {/* Coordinate Inputs */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                            <div>
                                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">
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
                                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">
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
                            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">
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
                                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                    Geofence Radius
                                </label>
                                <span className="text-sm font-semibold text-blue-600 tabular-nums">
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
                            <div className="flex justify-between text-[10px] font-semibold text-gray-400 uppercase tracking-wider mt-1">
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
                            <p className="text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wider mt-1">
                                {radiusNum}m radius from shop
                            </p>
                        </div>

                        {/* Save Button */}
                        <Button
                            variant="primary"
                            fullWidth
                            onClick={handleSave}
                            disabled={saving || !lat || !lng}
                        >
                            {saving ? 'Saving…' : 'Save shop location'}
                        </Button>
                    </div>

                    {/* Info Card */}
                    <div className="card-base p-5 bg-gray-50/50">
                        <h3 className="text-section-title mb-3">
                            How geofencing works
                        </h3>
                        <ul className="space-y-2 text-sm text-gray-600">
                            <li className="flex items-start gap-2">
                                <span className="text-green-500 mt-0.5">✓</span>
                                Staff must be within <strong>{radiusNum}m</strong> of this location to clock in
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-blue-500 mt-0.5">↻</span>
                                Times are recorded with exact minute precision
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
                    {/* Availability Settings Card */}
                    <div className="admin-section-card p-6">
                        <div className="mb-5">
                            <h2 className="text-section-title">Availability Settings</h2>
                            <p className="text-sm text-gray-500 mt-1">
                                Control how staff can submit their weekly availability.
                            </p>
                        </div>

                        <div className="flex items-center justify-between gap-4 py-4 border-t border-gray-100">
                            <div className="flex items-center gap-3">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                                    <Icon icon={SplitSquareVertical} size="sm" />
                                </span>
                                <div>
                                    <p className="text-sm font-semibold text-gray-800">Allow multiple time ranges per day</p>
                                    <p className="text-xs text-gray-400 mt-0.5">
                                        When off, staff can only set one availability block per day (e.g. 9:00–17:00).
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={allowMultipleRanges}
                                disabled={savingRangeToggle}
                                onClick={() => handleRangeToggle(!allowMultipleRanges)}
                                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50 ${
                                    allowMultipleRanges ? 'bg-blue-600' : 'bg-gray-300'
                                }`}
                            >
                                <span
                                    aria-hidden="true"
                                    className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md ring-0 transition-transform duration-200 ${
                                        allowMultipleRanges ? 'translate-x-5' : 'translate-x-0'
                                    }`}
                                />
                            </button>
                        </div>
                    </div>

        </div>
    );
}
