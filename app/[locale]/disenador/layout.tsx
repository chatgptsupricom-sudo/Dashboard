import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import React from "react";

export const metadata = {
  title: "Diseñador | Dashboard Supricom",
  description: "Catálogo de productos y actividades.",
};

export default async function DisenadorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
