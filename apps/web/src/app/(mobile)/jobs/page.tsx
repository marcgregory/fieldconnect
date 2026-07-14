import { JobQueueClient } from '@/components/mobile/JobQueueClient';

export const metadata = {
  title: 'FieldConnect - My Jobs',
  description: 'View your scheduled and completed jobs',
};

export default function JobsPage() {
  return <JobQueueClient />;
}