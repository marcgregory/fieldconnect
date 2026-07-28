import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { SignJWT } from 'jose';

const API_URL = process.env.API_URL || 'http://localhost:3001';
const PROXY_SECRET = process.env.FIELDCONNECT_PROXY_SECRET || '';

// Validate NEXTAUTH_SECRET at module initialization
const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET;
if (!NEXTAUTH_SECRET || NEXTAUTH_SECRET.trim() === '') {
  throw new Error('NEXTAUTH_SECRET environment variable is required and must not be empty');
}
const JWT_SECRET = new TextEncoder().encode(NEXTAUTH_SECRET);

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
    .setIssuer('fieldconnect-api')
    .setAudience('fieldconnect-web')
    .setExpirationTime('30m')
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

    // Propagate the real client IP and proxy secret for API-side validation.
    const clientIp =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      request.ip ||
      '';
    if (clientIp) headers['X-Real-IP'] = clientIp;
    if (PROXY_SECRET) headers['X-FieldConnect-Proxy-Secret'] = PROXY_SECRET;

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
          // Refresh succeeded and the retry returned a good response.
          // Set a flag cookie so the client knows to refresh its NextAuth
          // session token (which holds the updated refresh_token value).
          const proxyResponse = await buildProxyResponse(response);
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

    return buildProxyResponse(response);
  } catch (error) {
    console.error('Proxy error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}

/**
 * Build a proxied response, handling both JSON and non-JSON (CSV, binary, etc.)
 * content types without trying to parse the body as JSON.
 */
async function buildProxyResponse(response: Response): Promise<NextResponse> {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const data = await response.json();
    const proxyResponse = NextResponse.json(data, { status: response.status });

    // Copy over set-cookie headers if any
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      proxyResponse.headers.set('set-cookie', setCookie);
    }

    // Forward Cache-Control from the backend response. The Fastify API
    // sets `Cache-Control: no-store` on all responses; the proxy must
    // propagate this so intermediate caches don't serve stale auth data.
    const cacheControl = response.headers.get('cache-control');
    if (cacheControl) {
      proxyResponse.headers.set('cache-control', cacheControl);
    }

    return proxyResponse;
  }

  // Non-JSON response (CSV, images, etc.) — return as-is with original content type
  const body = await response.blob();
  return new NextResponse(body, {
    status: response.status,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': response.headers.get('content-disposition') || '',
      'Cache-Control': response.headers.get('cache-control') || '',
      'Content-Length': body.size.toString(),
    },
  });
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
