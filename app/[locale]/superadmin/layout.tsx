"use client";

import { Sidebar } from "@/components/dashboard/sidebar";
import { TopBar } from "@/components/dashboard/top-bar"; // Importamos el TopBar aquí
import { useState } from "react";

export default function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="flex min-h-screen bg-[#f8fafc]">
      {/* Sidebar: Asegúrate de que en su CSS tenga top-0 */}
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
        {/* Movemos el TopBar aquí para que sea el encabezado
           fijo del contenido y reciba la función de toggle
        */}
        <TopBar onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />

        <main className="flex-1 overflow-y-auto">
          <div className="p-8 max-w-[1600px] mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
}
