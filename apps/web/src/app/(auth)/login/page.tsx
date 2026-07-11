'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, Input } from '@fieldconnect/ui';
import { Logo } from '@/components/Logo';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setUnverifiedEmail(null);
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    // Direct call to Fastify so we can surface the structured 403 from
    // Phase 2 (email-not-verified). Auth.js's `signIn` collapses every
    // error into a generic string, which is great for bad credentials but
    // would hide the "please verify" flow we want to show.
    try {
      const res = await fetch(`${API_URL}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (res.status === 403) {
        const body = await res.json().catch(() => ({}));
        if (body?.code === 'EMAIL_NOT_VERIFIED') {
          setError('Please verify your email first.');
          setUnverifiedEmail(email);
          setLoading(false);
          return;
        }
      }

      if (!res.ok) {
        setError('Invalid email or password');
        setLoading(false);
        return;
      }

      // Credentials are good — create the NextAuth session cookie.
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      setLoading(false);

      if (result?.error) {
        setError('Invalid email or password');
        return;
      }

      router.push('/dashboard');
      router.refresh();
    } catch {
      setLoading(false);
      setError('Unable to connect to server. Is the API running?');
    }
  }

  return (
    <div className="premium-panel overflow-hidden rounded-[1.75rem] p-0">
      <div className="border-b border-slate-200 bg-white px-8 py-7 text-center text-slate-950">
        <div className="mb-3 flex justify-center">
          <Logo size={48} />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">FieldConnect</h1>
        <p className="mt-1 text-sm text-slate-500">Sign in to your account</p>
      </div>

      <div className="px-8 py-7">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@company.com"
          />

          <Input
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            placeholder="Password"
          />

          {error && (
            <div
              className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-800"
              role="alert"
            >
              {error}
              {unverifiedEmail && (
                <div className="mt-2">
                  <Link
                    href={`/verify-email?email=${encodeURIComponent(unverifiedEmail)}`}
                    className="font-bold text-brand-700 underline-offset-2 hover:text-brand-800 hover:underline"
                  >
                    Resend verification email
                  </Link>
                </div>
              )}
            </div>
          )}

          <Button type="submit" loading={loading} className="w-full">
            Sign In
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="font-bold text-brand-700 hover:text-brand-800">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
