import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/firebase-admin';

export async function POST(request: NextRequest) {
    try {
        const { idToken } = await request.json();

        if (!idToken) {
            return NextResponse.json({ error: 'No ID token provided' }, { status: 400 });
        }

        const auth = getAdminAuth();
        
        // Create session cookie
        const expiresIn = 60 * 60 * 24 * 5 * 1000; // 5 days
        const sessionCookie = await auth.createSessionCookie(idToken, { expiresIn });

        // Set the cookie in the response
        const response = NextResponse.json({ success: true });
        response.cookies.set('__session', sessionCookie, {
            maxAge: expiresIn,
            httpOnly: true,
            secure: request.nextUrl.protocol === 'https:',
            path: '/',
            sameSite: 'lax',
        });

        return response;
    } catch (error) {
        console.error('Error creating session:', error);
        return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
    }
}

export async function DELETE() {
    try {
        const response = NextResponse.json({ success: true });
        response.cookies.delete('__session');
        return response;
    } catch (error) {
        console.error('Error clearing session:', error);
        return NextResponse.json({ error: 'Failed to clear session' }, { status: 500 });
    }
}
