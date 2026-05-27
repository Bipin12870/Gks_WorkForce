import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Public routes that don't require authentication
const publicRoutes = ['/login', '/'];

// Protected route prefixes
const protectedPrefixes = ['/admin', '/staff', '/dashboard', '/clock'];

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Check if the route is public
    const isPublicRoute = publicRoutes.some(route => pathname === route || pathname.startsWith(route));

    // If public route, allow access
    if (isPublicRoute) {
        return NextResponse.next();
    }

    // Check if the route is protected
    const isProtectedRoute = protectedPrefixes.some(prefix => pathname.startsWith(prefix));

    // If protected route, check for session cookie presence
    if (isProtectedRoute) {
        const sessionCookie = request.cookies.get('__session');

        if (!sessionCookie) {
            // No session cookie found, redirect to login
            const loginUrl = new URL('/login', request.url);
            loginUrl.searchParams.set('redirect', pathname);
            return NextResponse.redirect(loginUrl);
        }
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - api (API routes)
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - public folder
         */
        '/((?!api|_next/static|_next/image|favicon.ico|public).*)',
    ],
};
