import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { MobileHomeClient } from '@/components/mobile/MobileHomeClient';

export const metadata = {
  title: 'FieldConnect - Mobile',
  description: 'Clock in and manage your jobs',
};

export default async function MobilePage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  return (
    <MobileHomeClient
      user={{
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        role: session.user.role,
      }}
    />
  );
}