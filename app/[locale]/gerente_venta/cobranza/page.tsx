"use client";

import CobranzaVendedores from "@/components/gerente_ventas/CobranzaVendedores";

// Ojo con el nombre de la ruta: el middleware manda al dashboard cualquier
// ruta con "/cuentas-por-cobrar" si el rol no es de CxC, por eso el ítem
// "Cuentas por Cobrar" de Gerencia de Ventas nunca abría nada.
export default function GerenteVentaCobranzaPage() {
  return <CobranzaVendedores />;
}
