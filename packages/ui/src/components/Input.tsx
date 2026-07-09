import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className = '', id, ...props }: InputProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`block w-full rounded-xl border bg-white/85 px-3.5 py-2.5 text-sm text-slate-950 shadow-sm transition-all placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 ${
          error
            ? 'border-red-300 focus:ring-red-500 focus:border-red-500'
            : 'border-slate-200'
        } ${className}`}
        {...props}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
