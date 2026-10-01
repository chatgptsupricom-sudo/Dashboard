import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import React from "react";

export const metadata = {
  title: "Servicio Técnico / RMA | Dashboard Supricom",
  description: "Gestión de garantías, reparaciones y devoluciones de productos.",
};

interface RmaLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

export default async function RmaLayout({
  children,
  params,
}: RmaLayoutProps) {
  const { locale } = await params;

  return (
    <DashboardLayout>
      <div className="flex flex-col flex-1 h-full overflow-hidden bg-gray-50/50 dark:bg-gray-900/50">
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </DashboardLayout>
  );
}
