import { DashboardLayout } from '@/components/dashboard/dashboard-layout';

export default async function AdminLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  return (
    <DashboardLayout>
      {children}
    </DashboardLayout>
  );
}
