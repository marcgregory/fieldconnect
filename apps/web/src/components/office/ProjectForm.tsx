'use client';

import { useState } from 'react';
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
import {
  createProjectSchema,
  type CreateProjectInput,
  type Project,
} from '@fieldconnect/shared';
import { createProject, updateProject } from '@/lib/api';

interface ProjectFormProps {
  project?: Project | null;
  onClose: () => void;
  onSaved: (project: Project) => void;
}

export function ProjectForm({ project, onClose, onSaved }: ProjectFormProps) {
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<CreateProjectInput>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: {
      name: project?.name ?? '',
      description: project?.description ?? '',
      address: project?.address ?? '',
      contact_name: project?.contact_name ?? '',
      contact_phone: project?.contact_phone ?? '',
      notes: project?.notes ?? '',
    },
  });

  async function onSubmit(values: CreateProjectInput) {
    setServerError(null);

    // The schema makes every non-name field optional, so undefined and
    // empty-string are equivalent for the API. Trim strings and drop
    // empties so we don't store whitespace in the database.
    const data: CreateProjectInput = {
      name: values.name.trim(),
      description: trimOrUndef(values.description),
      address: trimOrUndef(values.address),
      contact_name: trimOrUndef(values.contact_name),
      contact_phone: trimOrUndef(values.contact_phone),
      notes: trimOrUndef(values.notes),
    };

    try {
      const result = project
        ? await updateProject(project.id, data)
        : await createProject(data);
      onSaved(result);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Failed to save project');
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <h2 className="text-xl font-semibold text-gray-900">
          {project ? 'Edit Project' : 'New Project'}
        </h2>

        {serverError && (
          <div
            role="alert"
            className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm"
          >
            {serverError}
          </div>
        )}

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Project Name *</FormLabel>
              <FormControl>
                <Input placeholder="e.g. Smith Residence - Low Voltage" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <textarea
                  {...field}
                  value={field.value ?? ''}
                  placeholder="Brief description of the project"
                  rows={3}
                  className="block w-full rounded-xl border border-slate-200 bg-white/85 px-3.5 py-2.5 text-sm text-slate-950 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="address"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Address</FormLabel>
              <FormControl>
                <Input placeholder="123 Main St, City, State" {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="contact_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Contact Name</FormLabel>
                <FormControl>
                  <Input placeholder="Client contact" {...field} value={field.value ?? ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="contact_phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Contact Phone</FormLabel>
                <FormControl>
                  <Input placeholder="(555) 123-4567" {...field} value={field.value ?? ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <textarea
                  {...field}
                  value={field.value ?? ''}
                  placeholder="Internal notes"
                  rows={2}
                  className="block w-full rounded-xl border border-slate-200 bg-white/85 px-3.5 py-2.5 text-sm text-slate-950 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex gap-3 justify-end pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={form.formState.isSubmitting}>
            {project ? 'Save Changes' : 'Create Project'}
          </Button>
        </div>
      </form>
    </Form>
  );
}

function trimOrUndef(v: string | undefined): string | undefined {
  if (v == null) return undefined;
  const t = v.trim();
  return t.length === 0 ? undefined : t;
}
