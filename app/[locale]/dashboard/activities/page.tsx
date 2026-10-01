import { ActivitiesPageClient } from '@/components/dashboard/activities/activities-page-client';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function ActivitiesPage() {
  return <ActivitiesPageClient />;
}
