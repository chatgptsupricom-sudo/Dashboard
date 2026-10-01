import { DashboardPageClient } from '@/components/dashboard/dashboard-page-client';

// Desabilitar SSG para esta página
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function DashboardPage() {
  return <DashboardPageClient />;
}
