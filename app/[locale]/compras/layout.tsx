import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import React from "react";

export const metadata = {
  title: "Módulo de Compras | Dashboard Supricom",
  description: "Panel automatizado para sugerencias, órdenes y proveedores.",
};

interface ComprasLayoutProps {
  children: React.ReactNode;
  // 1. Actualizamos la interfaz para indicar que params es una Promesa
  params: Promise<{ locale: string }>;
}

export default async function ComprasLayout({
  children,
  params,
}: ComprasLayoutProps) {
  // 2. Resolvemos la promesa antes de usar sus propiedades
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
