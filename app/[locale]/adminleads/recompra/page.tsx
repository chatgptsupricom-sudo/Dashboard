"use client";

// Recompra de clientes de leads (los del panel y los de los Excel de antes del
// panel). Vive bajo /adminleads para heredar el guard de rol; se entra desde el
// menú y desde Cierres. La lista de leads de Excel, su importación y "Por
// revisar" están en Monitoreo Leads.

import RecompraClientes from "@/components/leads/RecompraClientes";
import { RecorridoGuiado, useRecorrido, type PasoRecorrido } from "@/components/ui/recorrido-guiado";
import { CircleHelp } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useState } from "react";

const PASOS: PasoRecorrido[] = [
  {
    titulo: "Recompra de clientes",
    texto:
      "Aquí ves cuántas veces volvió a comprar cada cliente que llegó por un lead, contando desde la primera venta que cerró ese lead. Entran los leads del panel y los de los Excel de redes de antes del panel.",
  },
  {
    selector: '[data-tour="filtros"]',
    titulo: "Filtros",
    texto:
      "Filtra por sede, por origen del lead (panel o Excel) y por la fecha de la primera venta. Por ejemplo, solo los clientes que se ganaron en el primer trimestre.",
  },
  {
    selector: '[data-tour="resumen"]',
    titulo: "Resumen",
    texto:
      "Cuántos clientes hay, cuántos volvieron a comprar (y qué %), cuántas compras hicieron después y por cuánto. «Ya eran clientes» son los que ya compraban antes de que entrara el lead.",
  },
  {
    selector: '[data-tour="tabla"]',
    titulo: "Cliente por cliente",
    texto:
      "Cada fila es un cliente, con la campaña de la que vino (debajo de «Lead»), el vendedor, la primera venta, las compras después, el monto y los días hasta la segunda compra. Haz clic en un cliente para ver cada compra con su fecha, sede y factura; las notas de crédito salen en amarillo y restan.",
  },
  {
    selector: '[data-tour="exportar"]',
    titulo: "Exportar a Excel",
    texto:
      "Baja lo que estás viendo, con los mismos filtros: resumen, clientes con su campaña, cada compra posterior y los leads vendidos a los que no se les ubicó el cliente.",
  },
  {
    titulo: "Cómo se cuentan las compras",
    texto:
      "Por RIF: hasta abril de 2026 en Smartbit y desde ahí en Odoo, sin IVA. Lo facturado hasta 3 días después de la primera venta es parte de ella. Los leads de Excel, su importación y «Por revisar» están en Monitoreo Leads. Este recorrido sale cada vez que entras, hasta que marques «No volver a mostrar»; también lo abres con «¿Cómo funciona?».",
  },
];

export default function RecompraPage() {
  const [listo, setListo] = useState(false);
  const recorrido = useRecorrido("tour-recompra-v2", listo, { cadaVez: true });
  const marcarListo = useCallback(() => setListo(true), []);
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      <div className="flex flex-col md:flex-row md:items-start gap-3">
        <div className="flex-1">
          <h1 className="text-3xl font-black text-slate-900">Recompra de clientes</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Cuántas veces volvió a comprar cada cliente después de la primera venta que cerró un lead.
          </p>
        </div>
        <button
          type="button"
          onClick={recorrido.abrir}
          className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-500 hover:text-emerald-700 px-3 py-1.5 rounded-full hover:bg-emerald-50 w-fit"
        >
          <CircleHelp className="w-4 h-4" /> ¿Cómo funciona?
        </button>
      </div>
      <RecompraClientes
        onVerSinRif={() => router.push(pathname.replace(/\/recompra\/?$/, "/monitoreo_leads?tab=revisar"))}
        onListo={marcarListo}
      />
      <RecorridoGuiado pasos={PASOS} abierto={recorrido.abierto} onCerrar={recorrido.cerrar} />
    </div>
  );
}
