'use client';

/**
 * shadcn-style Form primitives for FieldConnect.
 *
 * Built on top of react-hook-form (`<FormProvider>` + `<Controller>`) so any
 * consumer can pair them with `useForm({ resolver: zodResolver(schema) })`.
 *
 * Rules:
 *   - Presentation only. No business logic, no API calls, no schema knowledge.
 *   - Validation rules live in @fieldconnect/shared (Zod schemas).
 *   - Components never reach into a specific input/select/textarea — they
 *     render their `children` and inject id / aria-* via `FormControl`.
 *
 * Accessibility:
 *   - `<FormLabel>` is wired to its control via htmlFor/id
 *   - `<FormControl>` injects aria-invalid when the field is in error
 *   - `<FormDescription>` and `<FormMessage>` are linked to the control via
 *     aria-describedby, so screen readers announce them when the input is
 *     focused
 */

import * as React from 'react';
import {
  Controller,
  ControllerProps,
  FieldPath,
  FieldValues,
  FormProvider,
  useFormContext,
  useFormState,
} from 'react-hook-form';
import { cn } from '../lib/cn';

// ─── Form (provider wrapper) ────────────────────────────────────────────────

// Re-export react-hook-form's <FormProvider> as our public <Form> component.
// The component is generic over the form's field-values type so call sites
// that do `<Form {...form} />` with a typed `useForm<T>()` get their types
// preserved end-to-end (instead of collapsing to FieldValues).
//
// We can't type-annotate it as a one-liner because FormProvider's generic
// parameter is positional; the cast below widens it without losing the
// generic at the call site.
export const Form = FormProvider as <TFieldValues extends FieldValues = FieldValues>(
  props: React.ComponentProps<typeof FormProvider<TFieldValues>>,
) => React.ReactElement;

// ─── FormFieldContext ───────────────────────────────────────────────────────
// One context per <FormField> instance. The provider lives on the field; the
// consumer (useFormField) reads from it. This is the shadcn pattern — keeps
// each field self-contained and avoids prop drilling.

type FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = { name: TName };

const FormFieldContext = React.createContext<FormFieldContextValue>(
  {} as FormFieldContextValue,
);

type FormItemContextValue = { id: string };

const FormItemContext = React.createContext<FormItemContextValue>(
  {} as FormItemContextValue,
);

// ─── useFormField ───────────────────────────────────────────────────────────
// Reads the field's name from context, then pulls the matching error out of
// RHF's formState. Returns the id slots the other primitives need.

function useFormField() {
  const fieldContext = React.useContext(FormFieldContext);
  const itemContext = React.useContext(FormItemContext);
  const { getFieldState } = useFormContext();
  const formState = useFormState({ name: fieldContext.name });
  const fieldState = getFieldState(fieldContext.name, formState);

  if (!fieldContext) {
    throw new Error('useFormField must be used inside <FormField>');
  }

  const { id } = itemContext;

  return {
    id,
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  };
}

// ─── FormField ──────────────────────────────────────────────────────────────
// Wraps react-hook-form's <Controller>. Children is a render-prop that gets
// the field's onChange / value / ref / onBlur.

type FormFieldProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = ControllerProps<TFieldValues, TName>;

function FormField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({ ...props }: FormFieldProps<TFieldValues, TName>) {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  );
}

// ─── FormItem ───────────────────────────────────────────────────────────────
// A single field's container. Sets up the id slots that FormLabel /
// FormDescription / FormMessage / FormControl read from.

type FormItemProps = React.HTMLAttributes<HTMLDivElement>;

const FormItem = React.forwardRef<HTMLDivElement, FormItemProps>(
  function FormItem({ className, ...props }, ref) {
    const id = React.useId();
    return (
      <FormItemContext.Provider value={{ id }}>
        <div ref={ref} className={cn('space-y-1.5', className)} {...props} />
      </FormItemContext.Provider>
    );
  },
);

// ─── FormLabel ──────────────────────────────────────────────────────────────
// Native <label> with htmlFor wired to FormControl's id. Turns red when the
// field is invalid (matches the Input error styling).

const FormLabel = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(function FormLabel({ className, ...props }, ref) {
  const { error, formItemId } = useFormField();
  return (
    <label
      ref={ref}
      htmlFor={formItemId}
      className={cn(
        'block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500',
        error && 'text-red-600',
        className,
      )}
      {...props}
    />
  );
});

// ─── FormControl ────────────────────────────────────────────────────────────
// Clones its single child (must be a focusable input) and injects the id,
// aria-invalid, and aria-describedby slots.

const FormControl = React.forwardRef<
  React.ElementRef<'input'>,
  React.HTMLAttributes<HTMLElement> & {
    children: React.ReactElement;
  }
>(function FormControl({ children, ...props }, ref) {
  const { error, formItemId, formDescriptionId, formMessageId } = useFormField();

  // The single child is a real input/textarea/select. We hand it the id
  // (matching the label's htmlFor) and the ARIA attributes that screen
  // readers use to announce the description and the error message.
  const child = React.Children.only(children);
  const childProps = child.props as Record<string, unknown>;

  return React.cloneElement(child, {
    ref,
    id: formItemId,
    'aria-describedby': !error
      ? `${formDescriptionId}`
      : `${formDescriptionId} ${formMessageId}`,
    'aria-invalid': !!error,
    ...childProps,
    ...props,
  } as Record<string, unknown>);
});

// ─── FormDescription ────────────────────────────────────────────────────────
// Optional helper text shown below the input. Linked to the control via
// aria-describedby so it's read out with the field.

const FormDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(function FormDescription({ className, ...props }, ref) {
  const { formDescriptionId } = useFormField();
  return (
    <p
      ref={ref}
      id={formDescriptionId}
      className={cn('text-xs text-slate-500', className)}
      {...props}
    />
  );
});

// ─── FormMessage ────────────────────────────────────────────────────────────
// Error message for a field. Renders nothing when there's no error so the
// layout doesn't shift.

const FormMessage = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(function FormMessage({ className, children, ...props }, ref) {
  const { error, formMessageId } = useFormField();
  const body = error ? String(error?.message ?? '') : children;

  if (!body) return null;

  return (
    <p
      ref={ref}
      id={formMessageId}
      className={cn('text-sm font-medium text-red-600', className)}
      {...props}
    >
      {body}
    </p>
  );
});

export {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  useFormField,
};
