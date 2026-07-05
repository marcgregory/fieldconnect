'use client';

import React from 'react';
import { ToastProvider } from '@/components/Toast';
import { OfficeSocketNotifications } from './OfficeSocketNotifications';

export function OfficeClientWrapper({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <OfficeSocketNotifications />
      {children}
    </ToastProvider>
  );
}
