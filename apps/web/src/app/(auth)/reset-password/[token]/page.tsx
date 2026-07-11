'use client';

import { Suspense, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Spinner,
} from '@fieldconnect/ui';
import { resetPasswordFormSchema } from '@fieldconnect/shared';
import { Logo } from '@/components/Logo';
import type { z } from 'zod';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

type ResetPasswordFormInput = z.infer<typeof resetPasswordFormSchema>;

type PageState =
  | { kind: 'loading' }
  | { kind: 'form' }
  | { kind: 'expired' }
  | { kind: 'invalid' }
  | { kind: 'used' }
  | { kind: 'submitting' }
  | { kind: 'success' }
  | { kind: 'error'; message: string };

function ResetPasswordInner() {
  const params = useParams();
  const router = useRouter();
  const token = (params.token as string) ?? '';
  const [state, setState] = useState<PageState>({ kind: 'loading' });

  const form = useForm<ResetPasswordFormInput>({
    resolver: zodResolver(resetPasswordFormSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  // On mount, peek the token to decide which state to render.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${API_URL}/api/v1/auth/reset-password/${encodeURIComponent(token)}`,
        );
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;

        if (body?.success && body?.valid) {
          setState({ kind: 'form' });
        } else {
          const reason = (body?.reason ?? 'invalid') as string;
          if (reason === 'used') setState({ kind: 'used' });
          else if (reason === 'expired') setState({ kind: 'expired' });
          else setState({ kind: 'invalid' });
        }
      } catch {
        if (!cancelled) setState({ kind: 'error', message: 'Unable to reach the server.' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function onSubmit(values: ResetPasswordFormInput) {
    if (state.kind !== 'form') return;
    setState({ kind: 'submitting' });

    try {
      const res = await fetch(`${API_URL}/api/v1/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          password: values.password,
        }),
      });

      const body = await res.json().catch(() => ({}));

      if (res.ok && body?.success) {
        setState({ kind: 'success' });
        return;
      }

      // The token died between peek and submit (expired or used).
      const reason = (body?.reason ?? 'invalid') as string;
      if (reason === 'expired') setState({ kind: 'expired' });
      else if (reason === 'used') setState({ kind: 'used' });
      else setState({ kind: 'error', message: body?.error || 'Reset failed. Please try again.' });
    } catch {
      setState({ kind: 'error', message: 'Unable to reach the server.' });
    }
  }

  return (
    <div className="premium-panel overflow-hidden rounded-[1.75rem] p-0">
      <div className="border-b border-slate-200 bg-white px-8 py-7 text-center text-slate-950">
        <div className="mb-3 flex justify-center">
          <Logo size={48} />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">
          {state.kind === 'loading' && 'Checking your link…'}
          {state.kind === 'form' && 'Set a new password'}
          {state.kind === 'submitting' && 'Resetting your password…'}
          {state.kind === 'success' && 'Password updated'}
          {(state.kind === 'expired' || state.kind === 'used' || state.kind === 'invalid') && 'Link not valid'}
          {state.kind === 'error' && 'Something went wrong'}
        </h1>
      </div>

      <div className="px-8 py-7">
        {/* Loading */}
        {state.kind === 'loading' && (
          <div className="flex flex-col items-center gap-3 py-4">
            <Spinner size="md" />
            <p className="text-sm text-slate-500">Just a moment…</p>
          </div>
        )}

        {/* Success */}
        {state.kind === 'success' && (
          <>
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-700">
              Your password has been updated. You can now sign in with your new password.
            </p>
            <Button onClick={() => router.push('/login')} className="mt-6 w-full">
              Go to sign in
            </Button>
          </>
        )}

        {/* Expired */}
        {state.kind === 'expired' && (
          <>
            <p className="text-sm text-slate-600">
              This reset link has expired. Password reset links are only valid for one hour.
            </p>
            <Link href="/forgot-password">
              <Button variant="secondary" className="mt-6 w-full">
                Request a new link
              </Button>
            </Link>
          </>
        )}

        {/* Used */}
        {state.kind === 'used' && (
          <>
            <p className="text-sm text-slate-600">
              This reset link has already been used. If you need to reset again, request a new link.
            </p>
            <Link href="/forgot-password">
              <Button variant="secondary" className="mt-6 w-full">
                Request a new link
              </Button>
            </Link>
          </>
        )}

        {/* Invalid */}
        {state.kind === 'invalid' && (
          <>
            <p className="text-sm text-slate-600">
              This reset link is not valid. It may have been mistyped or is expired.
            </p>
            <Link href="/forgot-password">
              <Button variant="secondary" className="mt-6 w-full">
                Request a new link
              </Button>
            </Link>
          </>
        )}

        {/* Error */}
        {state.kind === 'error' && (
          <>
            <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">
              {state.message}
            </p>
            <Button onClick={() => router.refresh()} className="mt-6 w-full">
              Retry
            </Button>
          </>
        )}

        {/* Form */}
        {state.kind === 'form' && (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
              <p className="text-sm text-slate-600 mb-4">
                Choose a new password for your account. Use at least 8 characters.
              </p>

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        autoComplete="new-password"
                        placeholder="At least 8 characters"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm Password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        autoComplete="new-password"
                        placeholder="Repeat your new password"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                loading={form.formState.isSubmitting}
                disabled={state.kind !== 'form'}
                className="w-full"
              >
                Reset password
              </Button>
            </form>
          </Form>
        )}

        <p className="mt-6 text-center text-sm text-slate-500">
          <Link href="/login" className="font-bold text-brand-700 hover:text-brand-800">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="premium-panel overflow-hidden rounded-[1.75rem] p-8 text-center">
          <Spinner size="md" />
        </div>
      }
    >
      <ResetPasswordInner />
    </Suspense>
  );
}
