# Sprint 6 — Phase 7: Security Headers

## Status: Plan Ready

## Goals

1. Add `@fastify/helmet` with production-safe defaults
2. Create a minimal Content Security Policy (CSP) for FieldConnect's actual needs
3. Enable HSTS in production
4. Set all standard security headers
5. Review CORS configuration
6. Verify PWA, Socket.IO, and Cloudinary compatibility
7. Verify with Mozilla Observatory / SecurityHeaders.com after deploy

## Files to Modify

| File | Change |
|---|---|
| `apps/api/package.json` | Add `@fastify/helmet` dependency |
| `apps/api/src/index.ts` | Register `@fastify/helmet` with CSP, remove `X-Powered-By`, configure all security headers before CORS |
| `apps/web/next.config.js` | Add security headers for Next.js routes (HTML pages, static assets) |
| `.env.example` | Document new env var `ENABLE_HSTS` |

## Implementation

### 1. Install `@fastify/helmet`

```
pnpm --filter @fieldconnect/api add @fastify/helmet
```

### 2. Security Headers Configuration (`apps/api/src/index.ts`)

Register `@fastify/helmet` **before CORS** (Helmet's headers should be set before CORS processing). The configuration:

```ts
import helmet from '@fastify/helmet';

await app.register(helmet, {
  // CSP — allow only what FieldConnect needs
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // Next.js serves scripts from _next/static + self. No eval.
      scriptSrc: ["'self'"],
      // Next.js injects inline styles for CSS-in-JS; must allow unsafe-inline
      // for production builds too (Next.js 14 App Router uses inline style tags).
      // This is a known Next.js CSP gap — tracked as TD-009.
      styleSrc: ["'self'", "'unsafe-inline'"],
      // Cloudinary for image delivery, data: for canvas signatures,
      // blob: for user photo upload previews
      imgSrc: ["'self'", "data:", "blob:", "https://res.cloudinary.com"],
      // Socket.IO needs ws/wss for WebSocket transport + self for polling
      connectSrc: ["'self'", (req) => {
        // Allow WebSocket connections to the same origin
        const proto = req.protocol === 'https' ? 'wss' : 'ws';
        return `${proto}://${req.hostname}`;
      }],
      fontSrc: ["'self'"],
      // Only submit forms to self
      formAction: ["'self'"],
      // Prevent clickjacking (replaces X-Frame-Options)
      frameAncestors: ["'none'"],
      // Prevent base tag injection
      baseUri: ["'self'"],
      // Object tags not used
      objectSrc: ["'none'"],
      // No manifest-src needed (default-src covers it)
      upgradeInsecureRequests: [],  // empty array = enable, auto-bool in helmet
    },
    // Use nonces for reportOnly mode — only if we add a nonce gen later
    reportOnly: false,
  },
  // Remove X-Powered-By header
  hidePoweredBy: true,
  // HSTS — only in production
  strictTransportSecurity: process.env.NODE_ENV === 'production'
    ? { maxAge: 31536000, includeSubDomains: true, preload: true }
    : false,
  // X-Content-Type-Options: nosniff
  noSniff: true,
  // Referrer-Policy: strict-origin-when-cross-origin
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  // Permissions-Policy — disable unused features
  permissionsPolicy: {
    policy: {
      camera: ['self'],           // field techs take photos
      microphone: [],              // not used
      geolocation: ['self'],      // GPS clock-in/out
      payment: [],                // not used
      usb: [],                    // not used
      bluetooth: [],              // not used
      magnetometer: [],           // not used
      accelerometer: [],          // not used
      gyroscope: [],              // not used
      displayCapture: [],         // not used
      documentWrite: [],          // not used
      fullscreen: ['self'],       // PWA might use fullscreen
      screenWakeLock: ['self'],   // PWA might use wake lock
      notifications: ['self'],    // PWA install prompt
    },
  },
  // Cross-Origin-Resource-Policy: same-origin
  crossOriginResourcePolicy: { policy: 'same-origin' },
  // Cross-Origin-Opener-Policy: same-origin
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  // Origin-Agent-Cluster: ?1
  originAgentCluster: true,
  // X-DNS-Prefetch-Control: off
  dnsPrefetchControl: { allow: false },
  // Remove X-Frame-Options (replaced by CSP frame-ancestors)
  frameguard: false,
});
```

**CSP exception:** `style-src 'unsafe-inline'` is required because Next.js 14 App Router emits inline `<style>` tags for critical CSS. This is a documented limitation (`TD-009`). No other `'unsafe-*'` or wildcard directives.

### 3. Next.js Security Headers (`apps/web/next.config.js`)

Add `async headers()` to the config to set security headers on all Next.js-served pages and assets. This covers the frontend HTML and `/_next/static/*` responses. These are a defense-in-depth layer — the API already sets headers, but Next.js pages served directly from the web tier need them too.

```js
async headers() {
  return [
    {
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(self), fullscreen=(self), screen-wake-lock=(self), notifications=(self)' },
        { key: 'X-DNS-Prefetch-Control', value: 'off' },
      ],
    },
  ];
},
```

No HSTS or CSP in Next.js headers (the API serves those, and the frontend is a different origin in production — Render vs Vercel/traditional). Actually, wait — in the current architecture, Next.js IS the frontend serving HTML directly. API is on a separate port/service. So the Next.js headers matter for the browser-facing pages.

But we need to be careful: CSP in HTML pages served by Next.js must cover what those pages need. Let me reconsider...

Actually, Next.js has two roles:
1. **BFF/proxy** — serves API proxy routes at `/api/proxy/*`
2. **Frontend** — serves HTML pages, JS bundles, and static assets

The CSP for HTML pages matters because the browser enforces it. However, the API's CSP is for the API's own responses (which are JSON, not HTML). The CSP that matters for the frontend pages needs to be set by Next.js.

Let me refine: set CSP in Next.js headers, not API headers. The API doesn't serve HTML — it serves JSON. So CSP on the API is meaningless for browser security (no HTML to inject scripts into).

Actually wait — the CSP frame-ancestors directive IS useful on the API too for clickjacking prevention on any endpoint, but the main CSP for the frontend should be on Next.js.

Let me rethink the plan:

**API (`@fastify/helmet`)** — set:
- `X-Content-Type-Options`
- `X-Frame-Options` (or rely on CSP frame-ancestors)
- `Referrer-Policy`
- `Permissions-Policy`
- `Cross-Origin-Resource-Policy`
- `Cross-Origin-Opener-Policy`
- `Origin-Agent-Cluster`
- `X-DNS-Prefetch-Control`
- Remove `X-Powered-By`
- HSTS (production only)

**CSP** — set on Next.js, not the API, because CSP is an HTML-level policy.

Actually, let me reconsider again. There's a cleaner approach:

1. Set CSP on the **Next.js** HTML responses (the browser-facing pages)
2. Set all other security headers on **both** the API and Next.js (defense in depth)

For CSP on Next.js, we have two options:
a. Set it in `next.config.js` via `async headers()`
b. Set it in the root layout's `<head>` via a `<meta>` tag

Option (a) is better because `next.config.js` headers get set at the server level, before any content is sent.

But wait — CSP in `next.config.js` headers is static. The dynamic `connect-src` for WebSocket (which depends on the request hostname) can't be done there. For the WebSocket origin, we can use the `'self'` value in `connect-src` which covers both `https://` and `wss://` for the same origin.

Actually, `'self'` in `connect-src` covers `wss://` same-origin in most browsers. So we don't need a dynamic value. Let me simplify:

```js
// next.config.js CSP
connect-src 'self' https://res.cloudinary.com wss://${process.env.NEXT_PUBLIC_API_URL ? new URL(process.env.NEXT_PUBLIC_API_URL).host : 'localhost:3001'}
```

Hmm, that's complex. Best approach: use the static `next.config.js` headers with a fixed CSP that covers the common cases, or use a `<meta>` tag in the layout for CSP.

Actually, let's do both:
1. CSP in `next.config.js` `async headers()` for the production-optimized policy
2. The CSP covers `'self'` for connect-src which handles WebSocket same-origin

But in production, Next.js and the API are on different Render services (different hostnames/ports). So `connect-src 'self'` won't allow WebSocket connections to the API server.

This means we need the API URL in the CSP. Let's use the environment variable approach:

```js
// next.config.js
const API_HOST = process.env.NEXT_PUBLIC_API_URL 
  ? new URL(process.env.NEXT_PUBLIC_API_URL).host 
  : 'localhost:3001';
const WS_PROTO = process.env.NODE_ENV === 'production' ? 'wss' : 'ws';

module.exports = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self'",
              "style-src 'self' 'unsafe-inline'",
              `img-src 'self' data: blob: https://res.cloudinary.com`,
              `connect-src 'self' ${WS_PROTO}://${API_HOST}`,
              "font-src 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "object-src 'none'",
              "upgrade-insecure-requests",
            ].join('; '),
          },
          // ... other headers
        ],
      },
    ];
  },
};
```

This is cleaner. Now for the API side, we still register `@fastify/helmet` but without CSP (since API doesn't serve HTML), or with a minimal CSP.

Wait, there's actually value in having CSP on API responses too — if the API ever serves HTML (error pages, redirect pages), CSP protects against XSS. Fastify's default error handler returns HTML. But it's unlikely to be a real risk. Let me just set security headers (no CSP) on the API via `@fastify/helmet` and set the full CSP on Next.js.

Let me finalize the plan:

### Final Architecture

**API (`@fastify/helmet`):**
- All standard security headers EXCEPT CSP (API serves JSON, not HTML)
- Remove `X-Powered-By`
- HSTS in production
- Review CORS

**Next.js (`next.config.js`):**
- Full CSP with all directives
- All standard security headers

This is the cleanest split.

Let me write the final plan.<｜end▁of▁thinking｜>Now I have the full picture. Let me present the plan.

<｜｜DSML｜｜tool_calls>
<｜｜DSML｜｜invoke name="ExitPlanMode">
