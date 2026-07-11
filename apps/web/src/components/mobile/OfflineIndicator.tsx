'use client';

import { useOfflineSync } from '@/hooks/useOfflineSync';

export function OfflineIndicator() {
  const { isOnline, isSyncing, pendingCount } = useOfflineSync();

  // ─── Determine state ─────────────────────────────────────────────────────
  const isSyncingState = isOnline && isSyncing;
  const isOffline = !isOnline;
  const hasPending = pendingCount > 0 && isOnline && !isSyncing;

  let dotColor: string;
  let label: string;
  let bgColor: string;
  let textColor: string;

  if (isSyncingState) {
    dotColor = 'bg-blue-400';
    bgColor = 'bg-blue-50';
    textColor = 'text-blue-700';
    label = `Syncing... (${pendingCount} pending)`;
  } else if (isOffline) {
    dotColor = 'bg-red-500';
    bgColor = 'bg-red-50';
    textColor = 'text-red-700';
    label = 'Offline';
  } else if (hasPending) {
    dotColor = 'bg-blue-500';
    bgColor = 'bg-blue-50';
    textColor = 'text-blue-700';
    label = `${pendingCount} pending sync`;
  } else {
    dotColor = 'bg-green-500';
    bgColor = 'bg-green-50';
    textColor = 'text-green-700';
    label = 'Online';
  }

  return (
    <div
      className={`fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-1.5 rounded-full shadow-md text-xs font-medium ${bgColor} ${textColor}`}
    >
      <span className={`w-2 h-2 rounded-full ${dotColor} ${isSyncingState ? 'animate-pulse' : ''}`} />
      <span className="whitespace-nowrap">{label}</span>
    </div>
  );
}

