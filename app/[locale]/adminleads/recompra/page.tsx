"use client";

// Recompra de clientes de leads + los leads de Excel de antes del panel.
// Vive bajo /adminleads para heredar el guard de rol; se entra desde el menú y desde Cierres.

import LeadsHistoricos from "@/components/leads/LeadsHistoricos";
import LeadsPorRevisar from "@/components/leads/LeadsPorRevisar";
import RecompraClientes from "@/components/leads/RecompraClientes";
import { RecorridoGuiado, useRecorrido, type PasoRecorrido } from "@/components/ui/recorrido-guiado";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CircleHelp } from "lucide-react";
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
      "Cada fila es un cliente, con el vendedor, la primera venta, las compras después, el monto y los días hasta la segunda compra. Haz clic en un cliente para ver cada compra con su fecha, sede y factura.",
  },
  {
    selector: '[data-tour="exportar"]',
    titulo: "Exportar a Excel",
    texto:
      "Baja lo que estás viendo, con los mismos filtros: resumen, clientes, cada compra posterior y los leads vendidos a los que no se les ubicó el cliente.",
  },
  {
    selector: '[data-tour="tab-excel"]',
    titulo: "Leads de Excel",
    texto:
      "Aquí se suben los Excel de leads de redes y el reporte de facturas de Smartbit de la sede. El panel busca solo el RIF de cada venta (por la factura, el pedido, el teléfono o el nombre) y lo puedes corregir a mano.",
  },
  {
    selector: '[data-tour="tab-revisar"]',
    titulo: "Por revisar",
    texto:
      "Ventas del Excel a las que no se les encontró el cliente, y leads que quedaron como contactado o negociación pero el cliente sí compró después. Confirma o descarta con un clic: volver a subir el Excel no lo deshace.",
  },
  {
    titulo: "Cómo se cuentan las compras",
    texto:
      "Por RIF, en todas las sedes: hasta abril de 2026 en Smartbit y desde ahí en Odoo. Lo facturado hasta 3 días después de la primera venta es parte de ella. Puedes volver a ver este recorrido con «¿Cómo funciona?».",
  },
];

export default function RecompraPage() {
  const [tab, setTab] = useState("recompra");
  const [porRevisar, setPorRevisar] = useState<number | null>(null);
  const [listo, setListo] = useState(false);
  const recorrido = useRecorrido("tour-recompra-v1", listo);
  const marcarListo = useCallback(() => setListo(true), []);

  // Los pasos señalan cosas de la pestaña Recompra: el recorrido siempre arranca ahí.
  const abrirRecorrido = () => {
    setTab("recompra");
    recorrido.abrir();
  };

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
          onClick={abrirRecorrido}
          className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-500 hover:text-emerald-700 px-3 py-1.5 rounded-full hover:bg-emerald-50 w-fit"
        >
          <CircleHelp className="w-4 h-4" /> ¿Cómo funciona?
        </button>
      </div>
      <Tabs value={tab} onValueChange={setTab} className="gap-6">
        <TabsList className="w-full justify-start overflow-x-auto h-auto p-1 rounded-2xl">
          <TabsTrigger value="recompra" className="rounded-xl">Recompra</TabsTrigger>
          <TabsTrigger value="excel" className="rounded-xl" data-tour="tab-excel">Leads de Excel</TabsTrigger>
          <TabsTrigger value="revisar" className="rounded-xl" data-tour="tab-revisar">
            Por revisar{porRevisar ? ` (${porRevisar})` : ""}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="recompra">
          <RecompraClientes onVerSinRif={() => setTab("revisar")} onListo={marcarListo} />
        </TabsContent>
        <TabsContent value="excel">
          <LeadsHistoricos />
        </TabsContent>
        <TabsContent value="revisar">
          <LeadsPorRevisar onCambio={setPorRevisar} />
        </TabsContent>
      </Tabs>

      <RecorridoGuiado pasos={PASOS} abierto={recorrido.abierto} onCerrar={recorrido.cerrar} />
    </div>
  );
}
