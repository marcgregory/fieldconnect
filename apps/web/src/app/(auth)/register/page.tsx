'use client';

import { useState } from 'react';
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
import { registerSchema, type CreateUserInput } from '@fieldconnect/shared';
import { mapApiErrorToFormError, mapApiResponseToFormError, type FormError } from '@/lib/map-api-error';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const ROLES = [
  { value: 'field_technician', label: 'Field Technician' },
  { value: 'dispatcher', label: 'Dispatcher' },
  { value: 'office_manager', label: 'Office Manager' },
  { value: 'admin', label: 'Administrator' },
];

export default function RegisterPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<FormError | null>(null);

  const form = useForm<CreateUserInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: '', name: '', password: '', role: 'field_technician' },
  });

  async function onSubmit(values: CreateUserInput) {
    setServerError(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      if (!res.ok) {
        setServerError(await mapApiResponseToFormError(res));
        return;
      }

      // Send the new user to the "check your email" page where they can
      // resend if the message is delayed. Login is blocked until the email
      // is verified (Sprint 6, Phase 2).
      router.push('/verify-email?email=' + encodeURIComponent(values.email));
    } catch (err) {
      setServerError(mapApiErrorToFormError(err));
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
      <div className="text-center mb-8">
        <div className="flex justify-center mb-3">
          <Logo size={48} />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">FieldConnect</h1>
        <p className="text-gray-500 mt-1">Create your account</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          {serverError && (
            <div
              role="alert"
              className="text-sm text-red-600 bg-red-50 rounded-lg p-3"
            >
              {serverError.message}
            </div>
          )}

          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Full Name</FormLabel>
                <FormControl>
                  <Input
                    type="text"
                    placeholder="John Smith"
                    autoComplete="name"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

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
                    autoComplete="new-password"
                    placeholder="••••••••"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="role"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Role</FormLabel>
                <FormControl>
                  <select
                    {...field}
                    className="block w-full rounded-lg border border-slate-200 bg-white/85 px-3.5 py-2.5 text-sm text-slate-950 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  >
                    {ROLES.map((role) => (
                      <option key={role.value} value={role.value}>
                        {role.label}
                      </option>
                    ))}
                  </select>
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
            Create Account
          </Button>
        </form>
      </Form>

      <p className="text-center text-sm text-gray-500 mt-6">
        Already have an account?{' '}
        <Link href="/login" className="text-blue-600 hover:text-blue-700 font-medium">
          Sign in
        </Link>
      </p>
    </div>
  );
}
