import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { SignJWT } from 'jose';

const API_URL = process.env.API_URL || 'http://localhost:3001';
const JWT_SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET || 'fallback-secret-do-not-use-in-production',
);

/**
 * Sign a JWT that the Fastify API can verify.
 * next-auth encrypts its JWT by default (JWE), so we extract the payload
 * and re-sign it as a plain JWT for the backend.
 */
async function signBackendJWT(payload: {
  sub: string;
  role: string;
  email: string;
  name: string;
}): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(JWT_SECRET);
}

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } },
) {
  return proxyRequest(request, params.path, 'GET');
}

export async function POST(
  request: NextRequest,
  { params }: { params: { path: string[] } },
) {
  return proxyRequest(request, params.path, 'POST');
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { path: string[] } },
) {
  return proxyRequest(request, params.path, 'PUT');
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { path: string[] } },
) {
  return proxyRequest(request, params.path, 'PATCH');
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { path: string[] } },
) {
  return proxyRequest(request, params.path, 'DELETE');
}

async function proxyRequest(
  request: NextRequest,
  path: string[],
  method: string,
) {
  try {
    // Get the JWT payload from the next-auth session (decrypts the encrypted cookie)
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });

    // Build the target URL
    const pathStr = path.join('/');
    const searchParams = request.nextUrl.searchParams.toString();
    const targetUrl = `${API_URL}/${pathStr}${searchParams ? `?${searchParams}` : ''}`;

    // Determine if this is a multipart/form-data request (file upload)
    const contentType = request.headers.get('content-type') || '';
    const isMultipart = contentType.includes('multipart/form-data');

    // Build headers and body
    const headers: Record<string, string> = {};

    // Sign a backend JWT if the user is authenticated
    if (token?.sub && token?.role) {
      const backendToken = await signBackendJWT({
        sub: token.sub as string,
        role: token.role as string,
        email: (token.email as string) || '',
        name: (token.name as string) || '',
      });
      headers['Authorization'] = `Bearer ${backendToken}`;
    }

    let body: BodyInit | undefined;

    if (method !== 'GET' && method !== 'HEAD') {
      if (isMultipart) {
        // For multipart uploads, pass through the original body and content-type
        body = await request.blob();
        headers['Content-Type'] = contentType;
      } else {
        // For JSON requests, read body text
        const requestText = await request.text();
        if (requestText) {
          headers['Content-Type'] = 'application/json';
          body = requestText;
        }
      }
    }

    // Make the request to the Fastify API
    const response = await fetch(targetUrl, {
      method,
      headers,
      body: body || undefined,
    });

    const data = await response.json();

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Proxy error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
