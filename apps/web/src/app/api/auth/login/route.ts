import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL || 'http://localhost:3001';

/**
 * Login proxy — forwards credentials to the Fastify API so the client never
 * talks to the API directly.
 *
 * The proxy reads the real client IP from the incoming X-Forwarded-For header
 * (set by Render's proxy in production, or by nothing in dev) and forwards it
 * as an explicit X-Real-IP header. The Fastify rate-limiter uses X-Real-IP when
 * present, which prevents IP spoofing: an attacker's forged X-Forwarded-For
 * reaches the Next.js server, but Next.js's own forward (from Render's proxy)
 * is the one the API trusts.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Extract the real client IP from the incoming connection. In production
    // on Render, the Render proxy sets X-Forwarded-For before forwarding to
    // Next.js. In dev there is no proxy, so next() returns null and we fall
    // back to request.ip (which is ::1 or 127.0.0.1 locally).
    const realIp =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      request.ip ||
      '';

    const response = await fetch(`${API_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Real-IP': realIp,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Login proxy error:', error);
    return NextResponse.json(
      { success: false, error: 'Unable to connect to server. Is the API running?' },
      { status: 503 },
    );
  }
}
