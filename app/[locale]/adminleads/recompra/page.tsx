"use client";

// Recompra de clientes de leads + los leads de Excel de antes del panel.
// Vive bajo /adminleads para heredar el guard de rol; se entra desde el menú y desde Cierres.

import LeadsHistoricos from "@/components/leads/LeadsHistoricos";
import LeadsPorRevisar from "@/components/leads/LeadsPorRevisar";
import RecompraClientes from "@/components/leads/RecompraClientes";
import { RecorridoGuiado, useRecorrido, type PasoRecorrido } from "@/components/ui/recorrido-guiado";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CircleHelp } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

type Tab = "recompra" | "excel" | "revisar";

// Cada paso dice en qué pestaña está: el recorrido cambia de pestaña solo.
const pasosDe = (ir: (t: Tab) => void): PasoRecorrido[] => {
  const en = (t: Tab, pasos: PasoRecorrido[]) => pasos.map((p) => ({ ...p, antes: () => ir(t) }));
  return [
    ...en("recompra", [
      {
        titulo: "Recompra de clientes",
        texto:
          "Aquí ves cuántas veces volvió a comprar cada cliente que llegó por un lead, contando desde la primera venta que cerró ese lead. Entran los leads del panel y los de los Excel de redes de antes del panel. El recorrido pasa por las tres pestañas.",
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
    ]),
    ...en("excel", [
      {
        selector: '[data-tour="tab-excel"]',
        titulo: "Leads de Excel",
        texto: "Aquí están los leads de los Excel de redes de antes del panel, los que se subieron al sistema.",
      },
      {
        selector: '[data-tour="importar"]',
        titulo: "Importar Excel",
        texto:
          "Sube el Excel de leads de redes o el reporte de facturas de Smartbit «Ventas / Devoluciones», eligiendo la sede. El panel reconoce cuál es. Se puede subir de nuevo: lo repetido se actualiza, no se duplica.",
      },
      {
        selector: '[data-tour="excel-campanas"]',
        titulo: "Campañas",
        texto:
          "Cada hoja del Excel es una campaña: el nombre sale de la hoja. Ábrelo y con el lápiz lo cambias por el de la campaña de Meta de esas fechas. Ese nombre es el que sale en la Recompra y en el Excel.",
      },
      {
        selector: '[data-tour="excel-tabla"]',
        titulo: "Todos los leads del Excel",
        texto:
          "Busca por cliente, vendedor, RIF o factura y filtra por estatus. «Vendidos sin RIF» muestra las ventas a las que el panel no les encontró el cliente.",
      },
      {
        selector: '[data-tour="excel-rif"]',
        titulo: "El RIF de cada venta",
        texto:
          "Los Excel no traen RIF: el panel lo busca por la factura, el pedido de Odoo, el teléfono o el nombre, y debajo dice cómo lo encontró. Si está mal, haz clic en el RIF para corregirlo; vacío, lo vuelve a buscar.",
      },
    ]),
    ...en("revisar", [
      {
        selector: '[data-tour="tab-revisar"]',
        titulo: "Por revisar",
        texto: "Lo que el panel no puede decidir solo: aquí lo confirmas o lo descartas con un clic.",
      },
      {
        selector: '[data-tour="revisar-filtros"]',
        titulo: "Dos tipos de casos",
        texto:
          "«Vendidos sin cliente»: el Excel dice que se vendió pero no se sabe a quién se facturó. «Posibles ventas sin marcar»: el lead quedó como contactado o negociación, pero ese cliente compró en los 90 días siguientes.",
      },
      {
        selector: '[data-tour="revisar-candidato"]',
        titulo: "El cliente que propone el panel",
        texto:
          "Con la prueba: mismo teléfono (lo más seguro), un número de la columna Factura/Pedido o el mismo nombre, y la primera compra con su fecha y monto. «Ya compraba» avisa que era cliente antes del lead.",
      },
      {
        selector: '[data-tour="revisar-elegir"]',
        titulo: "Confirmar",
        texto:
          "«Sí, se vendió» marca el lead como vendido a ese cliente; «Es este cliente» le pone el RIF a una venta. Entra al reporte al instante y volver a subir el Excel no lo deshace.",
      },
      {
        selector: '[data-tour="revisar-descartar"]',
        titulo: "Descartar",
        texto:
          "Si no fue una venta del lead, «No es venta» (o «Ninguno es») y no vuelve a salir. Lo confirmado se puede deshacer en «Leads de Excel», junto al estatus.",
      },
      {
        titulo: "Cómo se cuentan las compras",
        texto:
          "Por RIF, en todas las sedes: hasta abril de 2026 en Smartbit y desde ahí en Odoo. Lo facturado hasta 3 días después de la primera venta es parte de ella. Este recorrido sale cada vez que entras, hasta que marques «No volver a mostrar»; también lo abres con «¿Cómo funciona?».",
      },
    ]),
  ];
};

export default function RecompraPage() {
  const [tab, setTab] = useState<Tab>("recompra");
  const [porRevisar, setPorRevisar] = useState<number | null>(null);
  const [listo, setListo] = useState(false);
  const recorrido = useRecorrido("tour-recompra-v1", listo, { cadaVez: true });
  const marcarListo = useCallback(() => setListo(true), []);
  const pasos = useMemo(() => pasosDe(setTab), []);

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
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="gap-6">
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

      <RecorridoGuiado pasos={pasos} abierto={recorrido.abierto} onCerrar={recorrido.cerrar} />
    </div>
  );
}
