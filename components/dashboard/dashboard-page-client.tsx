"use client";

import { useAuthStore } from "@/lib/stores/auth.store";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { SuperAdminView } from "./dashboard-content";

export function DashboardPageClient() {
  const { user, isAuthenticated } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, router]);

  if (!isAuthenticated || !user) {
    return <div className="p-6">Redirigiendo al login...</div>;
  }

  return <SuperAdminView />;
}
