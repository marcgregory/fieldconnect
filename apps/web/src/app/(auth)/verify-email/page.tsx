'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
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
import { resendVerificationSchema } from '@fieldconnect/shared';
import { Logo } from '@/components/Logo';
import type { z } from 'zod';

type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const COOLDOWN_SECONDS = 60;

type SendState = 'idle' | 'sent' | 'rate_limited' | 'error';

function VerifyEmailInner() {
  const searchParams = useSearchParams();
  const email = searchParams.get('email') || '';

  const [sendState, setSendState] = useState<SendState>('idle');
  const [cooldown, setCooldown] = useState(0);

  const form = useForm<ResendVerificationInput>({
    resolver: zodResolver(resendVerificationSchema),
    defaultValues: { email },
  });

  // Tick down the client-side cooldown every second when active.
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function onSubmit(values: ResendVerificationInput) {
    if (cooldown > 0) return;
    setSendState('idle');

    let res: Response;
    try {
      res = await fetch(`${API_URL}/api/v1/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
    } catch {
      setSendState('error');
      return;
    }

    if (res.status === 429) {
      setSendState('rate_limited');
      setCooldown(COOLDOWN_SECONDS);
      return;
    }
    if (!res.ok) {
      setSendState('error');
      return;
    }
    setSendState('sent');
    setCooldown(COOLDOWN_SECONDS);
  }

  return (
    <div className="premium-panel overflow-hidden rounded-[1.75rem] p-0">
      <div className="border-b border-slate-200 bg-white px-8 py-7 text-center text-slate-950">
        <div className="mb-3 flex justify-center">
          <Logo size={48} />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">Check your email</h1>
        <p className="mt-1 text-sm text-slate-500">
          We sent a verification link to finish setting up your account.
        </p>
      </div>

      <div className="px-8 py-7">
        {email && (
          <p className="mb-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            Verification link sent to <strong className="font-semibold text-slate-950">{email}</strong>.
          </p>
        )}

        <p className="text-sm text-slate-600">
          Click the link in the email to verify your address. The link expires in 24 hours.
        </p>

        {sendState === 'sent' && (
          <p
            role="status"
            className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-700"
          >
            Sent — check your inbox (and spam folder).
          </p>
        )}
        {sendState === 'rate_limited' && (
          <p
            role="status"
            className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-700"
          >
            Please wait a minute before requesting another verification email.
          </p>
        )}
        {sendState === 'error' && (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700"
          >
            Couldn&apos;t send the email. Please try again in a moment.
          </p>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 space-y-3" noValidate>
            {/* The form has only an email field so the schema runs. We hide
                the input visually if we already have the email from the URL
                — but we keep it in the DOM so RHF still validates. */}
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem className={email ? 'sr-only' : ''}>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      autoComplete="email"
                      placeholder="you@company.com"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button
              type="submit"
              variant="secondary"
              disabled={cooldown > 0 || form.formState.isSubmitting}
              loading={form.formState.isSubmitting}
              className="w-full"
            >
              {cooldown > 0
                ? `Resend available in ${cooldown}s`
                : 'Resend verification email'}
            </Button>
          </form>
        </Form>

        <p className="mt-6 text-center text-sm text-slate-500">
          Already verified?{' '}
          <Link href="/login" className="font-bold text-brand-700 hover:text-brand-800">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  // useSearchParams() requires a Suspense boundary in Next.js 14.
  return (
    <Suspense
      fallback={
        <div className="premium-panel overflow-hidden rounded-[1.75rem] p-8 text-center">
          <Spinner size="md" />
        </div>
      }
    >
      <VerifyEmailInner />
    </Suspense>
  );
}
