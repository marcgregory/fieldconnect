import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL || 'http://localhost:3001';
const PROXY_SECRET = process.env.FIELDCONNECT_PROXY_SECRET || '';

/**
 * Build a JSON response that always carries Cache-Control: no-store.
 * Authentication responses must never be cached by the browser or any
 * intermediate proxy.
 */
function jsonResponse(body: unknown, init: ResponseInit = {}): NextResponse {
  const headers = new Headers(init.headers);
  headers.set('Cache-Control', 'no-store');
  return NextResponse.json(body, { ...init, headers });
}

/**
 * Login proxy — forwards credentials to the Fastify API so the client never
 * talks to the API directly.
 *
 * The proxy reads the real client IP from the incoming X-Forwarded-For header
 * (set by Render's proxy in production) and forwards it as an explicit
 * X-Real-IP header. The Fastify rate-limiter validates the X-FieldConnect-
 * Proxy-Secret before trusting X-Real-IP, preventing spoofing.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Extract the real client IP from the incoming connection. In production
    // on Render, the Render proxy sets X-Forwarded-For before forwarding to
    // Next.js. In dev there is no proxy, so we fall back to request.ip.
    const realIp =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      request.ip ||
      '';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Real-IP': realIp,
    };

    // Attach the shared proxy secret so Fastify can validate that X-Real-IP
    // came from this trusted BFF and not from a direct API caller.
    if (PROXY_SECRET) {
      headers['X-FieldConnect-Proxy-Secret'] = PROXY_SECRET;
    }

    const response = await fetch(`${API_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return jsonResponse(data, { status: response.status });
  } catch (error) {
    console.error('Login proxy error:', error);
    return jsonResponse(
      { success: false, error: 'Unable to connect to server. Is the API running?' },
      { status: 503 },
    );
  }
}
