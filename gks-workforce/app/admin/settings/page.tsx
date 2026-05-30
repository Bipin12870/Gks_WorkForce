'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { saveShopLocation, saveAvailabilitySettings, saveOperationalSettings } from '@/app/actions/settings';
import { getShopLocation } from '@/lib/geofence';
import { ShopLocation } from '@/types';
import { useNotification } from '@/contexts/NotificationContext';
import Button from '@/components/ui/Button';
import Icon from '@/components/ui/Icon';
import { MapPin, LocateFixed, Clock, CheckCircle2 } from 'lucide-react';

export default function AdminSettingsPage() {
    const { userData } = useAuth();
    const { showNotification } = useNotification();

    const [current, setCurrent] = useState<ShopLocation | null>(null);
    const [lat, setLat] = useState('');
    const [lng, setLng] = useState('');
    const [radius, setRadius] = useState('100');
    const [name] = useState('GKS Shop');
    const [locating, setLocating] = useState(false);
    const [savingLocation, setSavingLocation] = useState(false);
    
    // Operational Settings
    const [shopOpenTime, setShopOpenTime] = useState('09:00');
    const [shopCloseTime, setShopCloseTime] = useState('23:59');
    const [preventEarlyClockInMins, setPreventEarlyClockInMins] = useState('5');
    const [savingOperational, setSavingOperational] = useState(false);

    // Availability Settings
    const [allowMultipleRanges, setAllowMultipleRanges] = useState(false);

    useEffect(() => {
        (async () => {
            const loc = await getShopLocation();
            if (loc) {
                setCurrent(loc);
                setLat(String(loc.lat));
                setLng(String(loc.lng));
                setRadius(String(loc.radiusMetres));
                setAllowMultipleRanges(loc.allowMultipleAvailabilityRanges ?? false);
                setShopOpenTime(loc.shopOpenTime || '09:00');
                setShopCloseTime(loc.shopCloseTime || '23:59');
                setPreventEarlyClockInMins(String(loc.preventEarlyClockInMins ?? 5));
            }
        })();
    }, []);

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
                showNotification('Location captured successfully', 'success');
            },
            (err) => {
                setLocating(false);
                showNotification(`Could not get location: ${err.message}`, 'error');
            },
            { enableHighAccuracy: true, timeout: 10_000 }
        );
    };

    const handleSaveLocation = async () => {
        if (!userData) return;
        const parsedLat = parseFloat(lat);
        const parsedLng = parseFloat(lng);
        const parsedRadius = parseInt(radius, 10);

        if (!lat || !lng || isNaN(parsedLat) || isNaN(parsedLng)) {
            showNotification('Please capture your location first.', 'error');
            return;
        }

        setSavingLocation(true);
        try {
            await saveShopLocation(parsedLat, parsedLng, parsedRadius, name);
            setCurrent({ ...current, lat: parsedLat, lng: parsedLng, radiusMetres: parsedRadius, name: name } as ShopLocation);
            showNotification('Location saved successfully!', 'success');
        } catch (err) {
            showNotification((err as Error).message || 'Failed to save location.', 'error');
        } finally {
            setSavingLocation(false);
        }
    };

    const handleSaveOperational = async () => {
        const preventEarlyMins = parseInt(preventEarlyClockInMins, 10) || 5;
        
        setSavingOperational(true);
        try {
            await saveOperationalSettings(shopOpenTime, shopCloseTime, preventEarlyMins);
            await saveAvailabilitySettings(allowMultipleRanges);
            showNotification('Operational settings saved!', 'success');
        } catch (err) {
            showNotification((err as Error).message || 'Failed to save settings.', 'error');
        } finally {
            setSavingOperational(false);
        }
    };

    const radiusNum = parseInt(radius, 10) || 100;

    return (
        <div className="max-w-2xl mx-auto w-full pb-16 space-y-6">
            
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
                <p className="text-sm text-gray-500 mt-1">Manage your shop&apos;s core configuration.</p>
            </div>

            {/* LOCATION CARD */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-6 border-b border-gray-100 flex items-center gap-3 bg-gray-50/50">
                    <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                        <Icon icon={MapPin} size="sm" />
                    </div>
                    <div>
                        <h2 className="text-base font-semibold text-gray-900">Shop Location</h2>
                        <p className="text-sm text-gray-500">Staff must be within this area to clock in.</p>
                    </div>
                </div>

                <div className="p-6 space-y-6">
                    {/* Capture Button */}
                    <div>
                        <Button 
                            variant="secondary" 
                            className="w-full sm:w-auto"
                            onClick={handleUseMyLocation}
                            disabled={locating}
                        >
                            <Icon icon={LocateFixed} size="sm" className="mr-2 text-blue-600" />
                            {locating ? 'Getting location...' : 'Set your location'}
                        </Button>
                        
                        {lat && lng && (
                            <div className="mt-3 flex items-center gap-2 text-sm text-green-700 font-medium">
                                <Icon icon={CheckCircle2} size="sm" />
                                Location is captured and ready
                            </div>
                        )}
                    </div>

                    {/* Geofence Slider */}
                    <div className="pt-2">
                        <div className="flex justify-between items-center mb-4">
                            <label className="text-sm font-medium text-gray-700">Geofence Radius</label>
                            <span className="text-sm font-bold text-gray-900 bg-gray-100 px-3 py-1 rounded-full">
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
                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                        />
                    </div>
                </div>

                <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end">
                    <Button 
                        variant="primary" 
                        onClick={handleSaveLocation}
                        disabled={savingLocation}
                    >
                        {savingLocation ? 'Saving...' : 'Set Location'}
                    </Button>
                </div>
            </div>


            {/* OPERATIONAL CARD */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-6 border-b border-gray-100 flex items-center gap-3 bg-gray-50/50">
                    <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
                        <Icon icon={Clock} size="sm" />
                    </div>
                    <div>
                        <h2 className="text-base font-semibold text-gray-900">Operating Hours</h2>
                        <p className="text-sm text-gray-500">Business rules for shifts and timesheets.</p>
                    </div>
                </div>

                <div className="p-6 space-y-6">
                    <div className="grid grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Opening Time</label>
                            <input
                                type="time"
                                value={shopOpenTime}
                                onChange={(e) => setShopOpenTime(e.target.value)}
                                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Closing Time</label>
                            <input
                                type="time"
                                value={shopCloseTime}
                                onChange={(e) => setShopCloseTime(e.target.value)}
                                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                            />
                        </div>
                    </div>

                    <div className="pt-4 border-t border-gray-100">
                        <label className="block text-sm font-medium text-gray-700 mb-2">Early Clock-in Limit (minutes)</label>
                        <input
                            type="number"
                            value={preventEarlyClockInMins}
                            onChange={(e) => setPreventEarlyClockInMins(e.target.value)}
                            placeholder="e.g. 5"
                            className="w-full sm:w-1/3 border border-gray-300 rounded-lg px-4 py-2.5 text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                        <p className="text-xs text-gray-500 mt-2">Prevents staff from clocking in too early before their shift.</p>
                    </div>

                    <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-900">Multiple Availability Ranges</p>
                            <p className="text-xs text-gray-500 mt-0.5">Allow staff to split their availability per day.</p>
                        </div>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={allowMultipleRanges}
                            onClick={() => setAllowMultipleRanges(!allowMultipleRanges)}
                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 ${
                                allowMultipleRanges ? 'bg-blue-600' : 'bg-gray-200'
                            }`}
                        >
                            <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ${
                                allowMultipleRanges ? 'translate-x-5' : 'translate-x-0'
                            }`} />
                        </button>
                    </div>
                </div>

                <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end">
                    <Button 
                        variant="primary" 
                        onClick={handleSaveOperational}
                        disabled={savingOperational}
                    >
                        {savingOperational ? 'Saving...' : 'Set Operating Hours'}
                    </Button>
                </div>
            </div>

        </div>
    );
}
