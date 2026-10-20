"use client";

import { Sidebar } from "@/components/dashboard/sidebar";
import { TopBar } from "@/components/dashboard/top-bar";
import { useEffect, useState } from "react";

// Inteligencia de Negocio: las páginas son las del SuperAdmin (se re-exportan
// desde /superadmin) y las APIs le cortan todo lo que escribe
// (lib/auth/inteligenciaNegocio.ts).
export default function InteligenciaNegocioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (window.innerWidth >= 768) setSidebarOpen(true);
  }, []);

  return (
    <div className="flex min-h-dvh bg-[#f8fafc]">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-[99] md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <Sidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
      />
      <div
        className={`flex-1 min-w-0 flex flex-col transition-all duration-300 ${
          sidebarOpen ? "md:pl-72" : "pl-0"
        }`}
      >
        <TopBar onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
        <main className="flex-1 overflow-y-auto">
          <div className="p-4 md:p-8 max-w-[1600px] mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
}
