import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import React from "react";

export const metadata = {
  title: "Cuentas por Cobrar | Dashboard Supricom",
  description: "Panel de gestión de cuentas por cobrar y cartera.",
};

interface CxcLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

export default async function CxcLayout({
  children,
  params,
}: CxcLayoutProps) {
  const { locale } = await params;

  return (
    <DashboardLayout locale={locale}>
      <div className="flex flex-col flex-1 h-full overflow-hidden bg-gray-50/50 dark:bg-gray-900/50">
        <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          {children}
        </div>
      </div>
    </DashboardLayout>
  );
}
