"use client";

import { Sidebar } from "@/components/dashboard/sidebar";
import { TopBar } from "@/components/dashboard/top-bar";
import { useState } from "react";

export default function GerenteVentaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="flex min-h-screen bg-[#f8fafc]">
      {/* Sidebar - Usarás el mismo componente, la lógica de rutas estará en el Sidebar */}
      <Sidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
      />

      {/* Contenedor Principal */}
      <div
        className={`flex-1 flex flex-col transition-all duration-300 ${
          sidebarOpen ? "md:pl-72" : "pl-0"
        }`}
      >
        <TopBar onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />

        <main className="flex-1 overflow-y-auto">
          {/* Aumenté el max-w ligeramente si el admin necesita ver tablas más anchas */}
          <div className="p-8 max-w-[1800px] mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
}
