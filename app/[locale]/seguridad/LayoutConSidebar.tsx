"use client";

import SidebarSeguridad from "@/components/seguridad/SidebarSeguridad";

/**
 * Envuelve el modulo con su propio sidebar.
 *
 * Es el sidebar del MODULO, no el del dashboard: el rol `seguridad` no tiene
 * por que ver el resto del panel, y por eso conserva `sections: []` en
 * lib/types.ts.
 */
export default function LayoutConSidebar({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <SidebarSeguridad />
      {/* El margen solo en escritorio: en movil el sidebar es un panel que se
          abre encima, no ocupa columna. */}
      <div className="lg:pl-60">{children}</div>
    </>
  );
}
