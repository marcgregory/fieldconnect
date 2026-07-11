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
import { forgotPasswordSchema } from '@fieldconnect/shared';
import { Logo } from '@/components/Logo';
import type { z } from 'zod';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const COOLDOWN_SECONDS = 60;

type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

function ForgotPasswordInner() {
  const searchParams = useSearchParams();
  const prefilledEmail = searchParams.get('email') || '';

  const [submitted, setSubmitted] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: prefilledEmail },
  });

  // Tick down the client-side cooldown every second when active.
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function onSubmit(values: ForgotPasswordInput) {
    if (cooldown > 0) return;
    setSubmitted(false);

    try {
      await fetch(`${API_URL}/api/v1/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
    } catch {
      // Network error — we still show the generic banner. The email might
      // still get through on a retry or the user can try again.
    }

    setSubmitted(true);
    setCooldown(COOLDOWN_SECONDS);
  }

  return (
    <div className="premium-panel overflow-hidden rounded-[1.75rem] p-0">
      <div className="border-b border-slate-200 bg-white px-8 py-7 text-center text-slate-950">
        <div className="mb-3 flex justify-center">
          <Logo size={48} />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">Reset your password</h1>
        <p className="mt-1 text-sm text-slate-500">
          Enter your email and we&apos;ll send you a reset link.
        </p>
      </div>

      <div className="px-8 py-7">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            {submitted && (
              <div
                role="alert"
                className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-medium text-slate-700"
              >
                If an account exists for that email, we sent a password reset link.
              </div>
            )}

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
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
              disabled={cooldown > 0 || form.formState.isSubmitting}
              loading={form.formState.isSubmitting}
              className="w-full"
            >
              {cooldown > 0
                ? `Try again in ${cooldown}s`
                : 'Send reset link'}
            </Button>
          </form>
        </Form>

        <p className="mt-6 text-center text-sm text-slate-500">
          Remember your password?{' '}
          <Link href="/login" className="font-bold text-brand-700 hover:text-brand-800">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="premium-panel overflow-hidden rounded-[1.75rem] p-8 text-center">
          <Spinner size="md" />
        </div>
      }
    >
      <ForgotPasswordInner />
    </Suspense>
  );
}
