'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button, Spinner } from '@fieldconnect/ui';
import { Logo } from '@/components/Logo';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

type ResultState =
  | { kind: 'loading' }
  | { kind: 'success' }
  | { kind: 'used' }
  | { kind: 'expired' }
  | { kind: 'invalid' }
  | { kind: 'error' };

function VerifyEmailResultInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [state, setState] = useState<ResultState>({ kind: 'loading' });

  useEffect(() => {
    if (!token) {
      setState({ kind: 'invalid' });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${API_URL}/api/v1/auth/verify-email?token=${encodeURIComponent(token)}`,
        );
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;

        if (res.ok && body?.success) {
          setState({ kind: 'success' });
          return;
        }

        const reason = body?.reason as 'invalid' | 'expired' | 'used' | undefined;
        if (reason === 'used') setState({ kind: 'used' });
        else if (reason === 'expired') setState({ kind: 'expired' });
        else setState({ kind: 'invalid' });
      } catch {
        if (!cancelled) setState({ kind: 'error' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="premium-panel overflow-hidden rounded-[1.75rem] p-0">
      <div className="border-b border-slate-200 bg-white px-8 py-7 text-center text-slate-950">
        <div className="mb-3 flex justify-center">
          <Logo size={48} />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">
          {state.kind === 'loading' && 'Verifying…'}
          {state.kind === 'success' && 'Email verified'}
          {state.kind === 'used' && 'Already verified'}
          {state.kind === 'expired' && 'Link expired'}
          {state.kind === 'invalid' && 'Link not valid'}
          {state.kind === 'error' && 'Something went wrong'}
        </h1>
      </div>

      <div className="px-8 py-7">
        {state.kind === 'loading' && (
          <div className="flex flex-col items-center gap-3 py-4">
            <Spinner size="md" />
            <p className="text-sm text-slate-500">Just a moment…</p>
          </div>
        )}

        {state.kind === 'success' && (
          <>
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-700">
              Your email is verified. You can now sign in.
            </p>
            <Button onClick={() => router.push('/login')} className="mt-6 w-full">
              Go to sign in
            </Button>
          </>
        )}

        {state.kind === 'used' && (
          <>
            <p className="text-sm text-slate-600">
              This email has already been verified. Head to sign in to continue.
            </p>
            <Button onClick={() => router.push('/login')} className="mt-6 w-full">
              Go to sign in
            </Button>
          </>
        )}

        {(state.kind === 'expired' || state.kind === 'invalid') && (
          <>
            <p className="text-sm text-slate-600">
              {state.kind === 'expired'
                ? 'This verification link has expired. Request a new one to verify your email.'
                : "We couldn't verify that link. Request a new one to try again."}
            </p>
            <Button
              onClick={() => router.push('/verify-email')}
              className="mt-6 w-full"
            >
              Request a new link
            </Button>
          </>
        )}

        {state.kind === 'error' && (
          <>
            <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">
              We couldn&apos;t reach the server. Check your connection and try again.
            </p>
            <Button
              onClick={() => router.refresh()}
              className="mt-6 w-full"
            >
              Retry
            </Button>
          </>
        )}

        <p className="mt-6 text-center text-sm text-slate-500">
          Need help?{' '}
          <Link href="/login" className="font-bold text-brand-700 hover:text-brand-800">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function VerifyEmailResultPage() {
  // useSearchParams() requires a Suspense boundary in Next.js 14.
  return (
    <Suspense
      fallback={
        <div className="premium-panel overflow-hidden rounded-[1.75rem] p-8 text-center">
          <Spinner size="md" />
        </div>
      }
    >
      <VerifyEmailResultInner />
    </Suspense>
  );
}
