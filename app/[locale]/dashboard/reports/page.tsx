import { ReportsPageClient } from '@/components/dashboard/reports/reports-page-client';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function ReportsPage() {
  return <ReportsPageClient />;
}
