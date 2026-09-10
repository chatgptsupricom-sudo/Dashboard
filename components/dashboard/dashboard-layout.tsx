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
      {/* min-w-0: sin esto, este hijo de un contenedor flex toma min-width
         auto (= min-content), asi que cualquier pagina con contenido ancho
         (una tabla larga, un grafico) estiraba TODO el shell mas alla del
         viewport y aparecia scroll horizontal en la app entera, no solo en
         el bloque ancho. Con min-w-0 la columna puede encogerse y el
         contenido ancho scrollea dentro de su propio contenedor. */}
      <div
        className={`flex-1 min-w-0 flex flex-col min-h-screen transition-all duration-300 ease-in-out ${
          sidebarOpen ? "md:pl-72" : "pl-0"
        }`}
      >
        <TopBar onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />

        <main className="flex-1 min-w-0 overflow-y-auto">
          <div className="min-w-0 p-6 md:p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
