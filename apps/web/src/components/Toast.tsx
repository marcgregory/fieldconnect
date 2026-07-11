'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';

export interface Toast {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  duration?: number;
}

interface ToastContextType {
  addToast: (toast: Omit<Toast, 'id'>) => void;
}

const ToastContext = React.createContext<ToastContextType>({
  addToast: () => {},
});

export function useToast(): ToastContextType {
  return React.useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counterRef = useRef(0);

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    counterRef.current += 1;
    const id = `toast-${counterRef.current}`;
    setToasts((prev) => [...prev, { id, ...toast }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      {/* Toast Container */}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm pointer-events-none">
        {toasts.map((toast) => (
          <ToastItem
            key={toast.id}
            toast={toast}
            onDismiss={() => removeToast(toast.id)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const TYPE_STYLES: Record<string, { bg: string; icon: string; border: string }> = {
  info: { bg: 'bg-blue-600', icon: 'ℹ', border: 'border-blue-700' },
  success: { bg: 'bg-green-600', icon: '✓', border: 'border-green-700' },
  warning: { bg: 'bg-blue-600', icon: '⚠', border: 'border-blue-700' },
  error: { bg: 'bg-red-600', icon: '✕', border: 'border-red-700' },
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const [progress, setProgress] = useState(100);
  const duration = toast.duration || 4000;

  useEffect(() => {
    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        onDismiss();
      }
    }, 50);

    return () => clearInterval(interval);
  }, [duration, onDismiss]);

  const style = TYPE_STYLES[toast.type] || TYPE_STYLES.info;

  return (
    <div
      className={`pointer-events-auto flex items-start gap-3 ${style.bg} text-white px-4 py-3 rounded-lg shadow-lg border ${style.border} min-w-[280px] animate-slide-up`}
    >
      <span className="text-base mt-0.5">{style.icon}</span>
      <p className="text-sm flex-1">{toast.message}</p>
      <button
        onClick={onDismiss}
        className="text-white/70 hover:text-white text-sm ml-2"
      >
        ✕
      </button>
      {/* Progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/20 rounded-b-lg overflow-hidden">
        <div
          className="h-full bg-white/50 transition-all duration-100 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

