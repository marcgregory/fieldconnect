'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button } from '@fieldconnect/ui';
import { Input } from '@fieldconnect/ui';
import Link from 'next/link';
import { Logo } from '@/components/Logo';

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

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
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">{error}</div>
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

