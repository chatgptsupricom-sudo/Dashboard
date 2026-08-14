import { AuditPageClient } from '@/components/dashboard/audit/audit-page-client';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function AuditPage() {
  return <AuditPageClient />;
}
