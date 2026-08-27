"use client";

import { usePathname } from "next/navigation";
import SidebarSeguridad from "@/components/seguridad/SidebarSeguridad";

/**
 * Envuelve el modulo con su propio sidebar, menos en el mostrador.
 *
 * El mostrador es la pantalla de estar de pie con el equipo en la mano y el
 * cliente enfrente: es mobile siempre y ya tiene sus propios botones grandes.
 * Meterle un sidebar le quita sitio a lo unico que ahi importa.
 *
 * Va en un componente cliente aparte porque el layout es servidor y necesita
 * mirar la ruta actual.
 */
export default function LayoutConSidebar({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname() || "";
  const esMostrador = pathname.includes("/seguridad/mostrador");

  if (esMostrador) return <>{children}</>;

  return (
    <>
      <SidebarSeguridad />
      {/* El margen solo en escritorio: en movil el sidebar es un panel que se
          abre encima, no ocupa columna. */}
      <div className="lg:pl-60">{children}</div>
    </>
  );
}
