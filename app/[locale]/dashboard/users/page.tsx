import { UsersPageClient } from '@/components/dashboard/users/users-page-client';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function UsersPage() {
  return <UsersPageClient />;
}
