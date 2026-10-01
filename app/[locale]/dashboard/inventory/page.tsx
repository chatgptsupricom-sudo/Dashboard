import { InventoryPageClient } from '@/components/dashboard/inventory/inventory-page-client';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function InventoryPage() {
  return <InventoryPageClient />;
}
