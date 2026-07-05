import type { Viewport } from 'next';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default async function OfficeLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  // Field technicians should not access office routes
  if (session.user.role === 'field_technician') {
    redirect('/mobile');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {children}
    </div>
  );
}
