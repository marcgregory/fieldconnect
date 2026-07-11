'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
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
} from '@fieldconnect/ui';
import { Logo } from '@/components/Logo';
import { loginSchema, type LoginInput } from '@fieldconnect/shared';
import { mapApiResponseToFormError, type FormError } from '@/lib/map-api-error';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function LoginPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<FormError | null>(null);

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  async function onSubmit(values: LoginInput) {
    setServerError(null);

    // Direct call to Fastify so we can surface the structured 403 from
    // Phase 2 (email-not-verified). Auth.js's `signIn` collapses every
    // error into a generic string, which is great for bad credentials but
    // would hide the "please verify" flow we want to show.
    let res: Response;
    try {
      res = await fetch(`${API_URL}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
    } catch (err) {
      setServerError({
        message: 'Unable to connect to server. Is the API running?',
        code: 'NETWORK',
      });
      return;
    }

    if (!res.ok) {
      setServerError(await mapApiResponseToFormError(res));
      return;
    }

    // Credentials are good — create the NextAuth session cookie.
    const result = await signIn('credentials', {
      email: values.email,
      password: values.password,
      redirect: false,
    });

    if (result?.error) {
      setServerError({
        message: 'Invalid email or password.',
        code: 'INVALID_CREDENTIALS',
      });
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
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            {serverError && (
              <div
                className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-800"
                role="alert"
              >
                {serverError.message}
                {serverError.code === 'EMAIL_NOT_VERIFIED' && (
                  <div className="mt-2">
                    <Link
                      href={`/verify-email?email=${encodeURIComponent(form.getValues('email'))}`}
                      className="font-bold text-brand-700 underline-offset-2 hover:text-brand-800 hover:underline"
                    >
                      Resend verification email
                    </Link>
                  </div>
                )}
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

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      autoComplete="current-password"
                      placeholder="Password"
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
              className="w-full"
            >
              Sign In
            </Button>
          </form>
        </Form>

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
