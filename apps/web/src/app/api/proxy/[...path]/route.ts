import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { SignJWT } from 'jose';

const API_URL = process.env.API_URL || 'http://localhost:3001';
const JWT_SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET || 'fallback-secret-do-not-use-in-production',
);

/**
 * Sign a JWT that the Fastify API can verify.
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

/**
 * Attempt to refresh the backend token using the refresh_token stored
 * in the NextAuth JWT session.
 */
async function tryRefresh(jwtToken: any): Promise<{
  accessToken: string;
  newRefreshToken: string;
} | null> {
  const refreshToken = jwtToken?.refreshToken;
  if (!refreshToken) return null;

  try {
    const res = await fetch(`${API_URL}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!res.ok) return null;

    const data = await res.json();
    if (!data?.access_token || !data?.refresh_token) return null;

    return {
      accessToken: data.access_token,
      newRefreshToken: data.refresh_token,
    };
  } catch {
    return null;
  }
}

async function proxyRequest(
  request: NextRequest,
  path: string[],
  method: string,
) {
  try {
    // Decrypt the NextAuth JWT cookie to get the session
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });

    // Build the target URL
    const pathStr = path.join('/');
    const searchParams = request.nextUrl.searchParams.toString();
    const targetUrl = `${API_URL}/${pathStr}${searchParams ? `?${searchParams}` : ''}`;

    // Sign a backend JWT if the user is authenticated
    let backendToken: string | undefined;
    if (token?.sub && token?.role) {
      backendToken = await signBackendJWT({
        sub: token.sub as string,
        role: token.role as string,
        email: (token.email as string) || '',
        name: (token.name as string) || '',
      });
    }

    // Build headers and body for the proxy request
    const { headers, body } = await buildRequest(request, backendToken);

    // Make the request
    let response = await fetch(targetUrl, {
      method,
      headers,
      body: body || undefined,
    });

    // If we got a 401 and have a refresh token, try to refresh and retry
    if (response.status === 401 && token) {
      const refreshResult = await tryRefresh(token);
      if (refreshResult) {
        headers['Authorization'] = `Bearer ${refreshResult.accessToken}`;
        response = await fetch(targetUrl, {
          method,
          headers,
          body: body || undefined,
        });

        if (response.ok) {
          const data = await response.json();
          const proxyResponse = NextResponse.json(data, { status: response.status });

          // Set a flag cookie the client can read to update its session
          // The actual NextAuth JWT refresh token is rotated server-side,
          // but we need the client to trigger a session update to pick up
          // the new refreshToken value stored in the JWT.
          // For now, the old refresh token remains valid briefly during rotation.
          proxyResponse.cookies.set('refresh_token_rotated', '1', {
            httpOnly: false,
            secure: true,
            sameSite: 'lax',
            path: '/',
            maxAge: 60,
          });

          return proxyResponse;
        }
      }
    }

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

/**
 * Build headers and body for the proxy request.
 */
async function buildRequest(
  request: NextRequest,
  backendToken?: string,
): Promise<{ headers: Record<string, string>; body?: BodyInit }> {
  const contentType = request.headers.get('content-type') || '';
  const isMultipart = contentType.includes('multipart/form-data');

  const headers: Record<string, string> = {};
  if (backendToken) {
    headers['Authorization'] = `Bearer ${backendToken}`;
  }

  let body: BodyInit | undefined;

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    if (isMultipart) {
      body = await request.blob();
      headers['Content-Type'] = contentType;
    } else {
      const requestText = await request.text();
      if (requestText) {
        headers['Content-Type'] = 'application/json';
        body = requestText;
      }
    }
  }

  return { headers, body };
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
