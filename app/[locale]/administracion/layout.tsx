"use client";

import { Sidebar } from "@/components/dashboard/sidebar";
import { TopBar } from "@/components/dashboard/top-bar";
import { useEffect, useState } from "react";

export default function AdministracionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // En movil el sidebar se muestra como overlay sobre el contenido, asi que
  // abrirlo por defecto tapaba toda la pantalla al entrar.
  useEffect(() => {
    if (window.matchMedia("(max-width: 767px)").matches) {
      setSidebarOpen(false);
    }
  }, []);

  return (
    <div className="flex min-h-screen bg-[#f8fafc]">
      <Sidebar open={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />
      {/* min-w-0: sin esto el contenedor flex no se encoge por debajo del ancho
          de su contenido, y una tabla ancha estira todo el layout provocando
          scroll horizontal en toda la pagina (el overflow-x-auto de la tabla
          no basta si el padre flex no puede encogerse). */}
      <div className={`flex-1 min-w-0 flex flex-col transition-all duration-300 ${sidebarOpen ? "md:pl-72" : "pl-0"}`}>
        <TopBar onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
        <main className="flex-1 overflow-y-auto">
          <div className="p-4 sm:p-6 lg:p-8 max-w-[1800px] mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
