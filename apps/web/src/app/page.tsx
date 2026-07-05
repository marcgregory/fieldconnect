import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  // Field technicians go to the mobile view
  if (session.user.role === 'field_technician') {
    redirect('/mobile');
  }

  // Everyone else goes to the dashboard
  redirect('/dashboard');
}
