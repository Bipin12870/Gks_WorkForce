/**
 * lib/geofence.ts
 * ─────────────────────────────────────────────────────────────
 * Pure geofence utilities — no React, no side-effects.
 * All functions are safe to call from client components.
 */

import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { ShopLocation } from '@/types';

// ─────────────────────────────────────────────────────────────
// TIME ROUNDING
// ─────────────────────────────────────────────────────────────

/**
 * Format a Date object as an HH:mm string.
 */
export function formatTimeToHHmm(date: Date): string {
    const h = date.getHours();
    const m = date.getMinutes();
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ─────────────────────────────────────────────────────────────
// DISTANCE CALCULATION (HAVERSINE)
// ─────────────────────────────────────────────────────────────

/**
 * Calculate the distance in metres between two GPS coordinates
 * using the Haversine formula. Accurate to within ~0.5% for
 * distances under 1 km, which is more than sufficient for a 100m geofence.
 */
export function getDistanceMetres(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
): number {
    const R = 6_371_000; // Earth radius in metres
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lng2 - lng1) * Math.PI) / 180;

    const a =
        Math.sin(Δφ / 2) ** 2 +
        Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;

    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Returns true if the clockOutRounded time is at least utes after shiftEndTime.
 * Both arguments must be HH:mm strings.
 */
export function isSignificantOvertime(clockOutRounded: string, shiftEndTime: string, thresholdMinutes = 30): boolean {
    const [oh, om] = clockOutRounded.split(':').map(Number);
    const [sh, sm] = shiftEndTime.split(':').map(Number);

    let diff = (oh * 60 + om) - (sh * 60 + sm);

    // Handle cross-midnight: If shift ended at 23:00 and they clocked out at 01:00
    if (diff < -1000) { // e.g. -1300 minutes difference
        diff += 24 * 60;
    }

    return diff >= thresholdMinutes;
}

// ─────────────────────────────────────────────────────────────
// SHOP LOCATION (FIRESTORE)
// ─────────────────────────────────────────────────────────────

/**
 * Fetch the shop location config from Firestore.
 * Returns null if no location has been configured yet.
 */
export async function getShopLocation(): Promise<ShopLocation | null> {
    const ref = doc(db, 'config', 'shopLocation');
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return snap.data() as ShopLocation;
}

// ─────────────────────────────────────────────────────────────
// GEOFENCE CHECK
// ─────────────────────────────────────────────────────────────

export interface GeofenceResult {
    withinRange: boolean;
    distanceMetres: number;
    radiusMetres: number;
}

/**
 * Check whether a GPS coordinate is within the configured shop radius.
 * Fetches the shop location from Firestore.
 * Returns null if no shop location has been set yet.
 */
export async function checkGeofence(
    userLat: number,
    userLng: number
): Promise<GeofenceResult | null> {
    const shop = await getShopLocation();
    if (!shop) return null;

    const distanceMetres = getDistanceMetres(userLat, userLng, shop.lat, shop.lng);

    return {
        withinRange: distanceMetres <= shop.radiusMetres,
        distanceMetres: Math.round(distanceMetres),
        radiusMetres: shop.radiusMetres,
    };
}
