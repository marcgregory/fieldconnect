import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
}

export function Card({ children, className = '', title }: CardProps) {
  return (
    <div className={`premium-panel rounded-2xl p-6 ${className}`}>
      {title && (
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">{title}</h3>
      )}
      {children}
    </div>
  );
}
