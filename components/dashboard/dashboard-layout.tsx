"use client";

import { useState } from "react";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* El Sidebar flota.
         No necesitamos que el Layout sepa su ancho,
         solo necesitamos que el contenido principal sepa si debe desplazarse.
      */}
      <Sidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
      />

      {/* CONTENEDOR PRINCIPAL:
         Aquí aplicamos el margen/padding.
         Si sidebarOpen es true -> aplicamos el espacio (md:pl-72).
         Si es false -> eliminamos el espacio.
      */}
      <div
        className={`flex-1 flex flex-col min-h-screen transition-all duration-300 ease-in-out ${
          sidebarOpen ? "md:pl-72" : "pl-0"
        }`}
      >
        <TopBar onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />

        <main className="flex-1 overflow-y-auto">
          <div className="p-6 md:p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
