import type { Metadata, Viewport } from 'next';
import { SessionProvider } from '@/components/SessionProvider';
import { InstallPrompt } from '@/components/InstallPrompt';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'FieldConnect',
    template: '%s | FieldConnect',
  },
  description: 'Project management and time tracking for low voltage contractors — manage jobs, schedules, and field technicians in real-time.',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
  openGraph: {
    title: 'FieldConnect',
    description: 'Project management and time tracking for low voltage contractors',
    type: 'website',
    siteName: 'FieldConnect',
    locale: 'en_US',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#2563eb',
  userScalable: true,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="format-detection" content="telephone=yes" />
        <meta name="application-name" content="FieldConnect" />
        <link rel="preconnect" href={process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'} />
        {/* Note: favicon is served from manifest.json — no need to preload */}
      </head>
      <body>
        {/* Skip-to-content link for keyboard users */}
        <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-blue-600 focus:text-white focus:rounded-lg focus:text-sm focus:font-medium">
          Skip to main content
        </a>
        <SessionProvider>{children}</SessionProvider>
        <InstallPrompt />
      </body>
    </html>
  );
}



