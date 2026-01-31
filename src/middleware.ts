import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Sliding window rate limiter in memory
// Note: In a true horizontal scaling environment with multiple instances,
// this should use Redis (e.g. Upstash) to sync state.
const rateLimitMap = new Map<string, { count: number, lastReset: number }>();

const LIMIT = 20; // requests
const WINDOW = 60 * 1000; // 1 minute

export function middleware(request: NextRequest) {
    // Only limit POST requests to sensitive endpoints
    const isSensitiveAction = request.method === 'POST' && (
        request.nextUrl.pathname.startsWith('/api/auth') ||
        request.nextUrl.pathname.includes('addPayment') ||
        request.nextUrl.pathname.includes('addTenant')
    );

    if (!isSensitiveAction) {
        return NextResponse.next();
    }

    const ip = request.ip || 'anonymous';
    const now = Date.now();
    const userData = rateLimitMap.get(ip) || { count: 0, lastReset: now };

    if (now - userData.lastReset > WINDOW) {
        userData.count = 1;
        userData.lastReset = now;
    } else {
        userData.count++;
    }

    rateLimitMap.set(ip, userData);

    if (userData.count > LIMIT) {
        return new NextResponse(
            JSON.stringify({ success: false, message: 'Too many requests. Please try again later.' }),
            { status: 429, headers: { 'content-type': 'application/json' } }
        );
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico).*)',
    ],
};
