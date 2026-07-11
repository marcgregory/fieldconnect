import type { Metadata } from 'next';
import Link from 'next/link';

// Must be dynamic for CSP nonce injection via middleware
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Access Denied',
  robots: { index: false, follow: false },
};

export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-gray-300 mb-4">403</h1>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Access Denied</h2>
        <p className="text-gray-500 mb-6">
          You don&apos;t have permission to access this page.
        </p>
        <Link
          href="/dashboard"
          className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
