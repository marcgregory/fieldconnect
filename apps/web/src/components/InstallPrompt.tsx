'use client';

import { useEffect, useState } from 'react';
import {
  isInstallCompleted,
  isInstallDismissed,
  isRunningInstalled,
  markInstallCompleted,
  markInstallDismissed,
} from '@/lib/pwa-install';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstall, setShowInstall] = useState(false);

  useEffect(() => {
    // Never show if already installed or user dismissed this session.
    if (isRunningInstalled() || isInstallCompleted() || isInstallDismissed()) {
      return;
    }

    // Register service worker
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js');
      });
    }

    // Listen for the browser's install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowInstall(true);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // If the user installs via the browser's own UI (some browsers can
    // install without firing beforeinstallprompt), the `appinstalled`
    // event still fires. Treat it as a permanent dismissal.
    const installedHandler = () => {
      markInstallCompleted();
      setShowInstall(false);
      setDeferredPrompt(null);
    };
    window.addEventListener('appinstalled', installedHandler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, []);

  async function handleInstall() {
    if (!deferredPrompt) return;
    try {
      deferredPrompt.prompt();
      const result = await deferredPrompt.userChoice;
      if (result.outcome === 'accepted') {
        // Browser will fire `appinstalled`; markInstallCompleted() is
        // called there as a backup so the banner stays hidden even if
        // the event is missed.
        markInstallCompleted();
        setShowInstall(false);
      }
      // If the user dismissed the in-browser prompt without using our X,
      // remember the dismissal for the rest of this session so we don't
      // re-show on every page.
      if (result.outcome === 'dismissed') {
        markInstallDismissed();
        setShowInstall(false);
      }
    } catch {
      // Prompt failed — user action may not be recent enough
    }
    setDeferredPrompt(null);
  }

  function handleDismiss() {
    markInstallDismissed();
    setShowInstall(false);
  }

  if (!showInstall) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 max-w-md mx-auto">
      <div className="bg-white rounded-2xl border border-blue-200 shadow-xl p-4 flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center text-white text-xl font-bold shrink-0">
          FC
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">Install FieldConnect</p>
          <p className="text-xs text-gray-500">Add to your home screen for quick access</p>
        </div>
        <button
          onClick={handleInstall}
          className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold shrink-0 active:bg-blue-700 transition-colors"
        >
          Install
        </button>
        <button
          onClick={handleDismiss}
          aria-label="Dismiss install prompt"
          className="text-gray-400 hover:text-gray-600 shrink-0"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
