import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { ReviewClient } from '@/components/office/ReviewClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Work Review - FieldConnect',
  description: 'Review completed technician jobs',
};

export default async function ReviewPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  // Only office staff can review
  if (session.user.role === 'field_technician') {
    redirect('/mobile');
  }

  return <ReviewClient />;
}
