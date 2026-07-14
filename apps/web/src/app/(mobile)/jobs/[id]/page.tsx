import { JobDetailClient } from '@/components/mobile/JobDetailClient';

export const metadata = {
  title: 'FieldConnect - Job Details',
  description: 'View job details and actions',
};

export default function JobDetailPage({
  params,
}: {
  params: { id: string };
}) {
  return <JobDetailClient scheduleId={params.id} />;
}