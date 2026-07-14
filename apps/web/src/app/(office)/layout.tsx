import type { Viewport } from 'next';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { OfficeClientWrapper } from '@/components/office/OfficeClientWrapper';
import { OfficeNav } from '@/components/office/OfficeNav';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default async function OfficeLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  if (session.user.role === 'field_technician') {
    redirect('/mobile');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <OfficeClientWrapper>
        <OfficeNav
          user={{
            name: session.user.name,
            role: session.user.role,
          }}
        />
        <main id="main-content">{children}</main>
      </OfficeClientWrapper>
    </div>
  );
}