import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { MobileHomeClient } from '@/components/mobile/MobileHomeClient';

export default async function MobilePage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  return <MobileHomeClient user={session.user} />;
}
