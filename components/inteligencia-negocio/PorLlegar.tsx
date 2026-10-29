"use client";

import { Aviso, EncabezadoAdmin, EstadoCarga, Tarjeta, fechaCorta, money, useDatosAdmin } from "@/components/administracion/comunes";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { FilaPorLlegar, OrigenLlegada, VentaProducto } from "@/lib/inteligencia-negocio/porLlegar";
import { Loader2, Receipt, Truck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Columna } from "./reportes/comunes";
import { NOMBRE_SEDE_ID, TablaReporte } from "./reportes/comunes";

type Datos = { success: true; data: { empresa: string; filas: FilaPorLlegar[]; avisos: string[] } };

const NOMBRE_SEDE: Record<number, string> = { ...NOMBRE_SEDE_ID, 7: "Panamá" };

type Fila = FilaPorLlegar & {
  ventas: "Sí" | "No";
  documentos: string;
  proveedor: string;
  origen: string;
  sedeNombre: string;
};

const ETAPA: Record<string, string> = { por_llegar: "en camino", descargando: "contándose" };

const textoOrigen = (o: OrigenLlegada) =>
  o.tipo === "odoo" ? o.documento || "Orden de compra" : `PL ${o.documento}${o.etapa && ETAPA[o.etapa] ? ` (${ETAPA[o.etapa]})` : ""}`;

function aFila(f: FilaPorLlegar): Fila {
  const tipos = new Set(f.origenes.map((o) => o.tipo));
  return {
    ...f,
    ventas: f.vendido ? "Sí" : "No",
    documentos: f.origenes.map(textoOrigen).join(" · "),
    proveedor: [...new Set(f.origenes.map((o) => o.proveedor).filter(Boolean))].join(" · "),
    origen: tipos.size === 2 ? "Orden de compra y packing list" : tipos.has("odoo") ? "Orden de compra" : "Packing list",
    sedeNombre: NOMBRE_SEDE[f.sede] ?? String(f.sede),
  };
}

/**
 * Por llegar (rol Inteligencia de Negocio): productos en camino, cuántos, y
 * si ya se vendieron en la sede, con el detalle de esas ventas
 * (lib/inteligencia-negocio/porLlegar.ts).
 */
export function PorLlegar() {
  const [empresa, setEmpresa] = useState("");
  const { datos, cargando, error } = useDatosAdmin<Datos>("/api/inteligencia-negocio/por-llegar", empresa, "");
  const filas = useMemo(() => (datos?.data.filas ?? []).map(aFila), [datos]);
  const [detalle, setDetalle] = useState<Fila | null>(null);
  const hoy = new Date(Date.now() - 4 * 3_600_000).toISOString().slice(0, 10);

  const resumen = useMemo(
    () => ({
      productos: filas.length,
      unidades: filas.reduce((s, f) => s + f.cantidad, 0),
      nuevos: filas.filter((f) => !f.vendido).length,
      atrasados: filas.filter((f) => f.fecha && f.fecha < hoy).length,
    }),
    [filas, hoy],
  );

  const columnas: Columna<Fila>[] = [
    ...(empresa === "" ? [{ clave: "sedeNombre", titulo: "Sede" } as Columna<Fila>] : []),
    { clave: "codigo", titulo: "Código" },
    { clave: "producto", titulo: "Producto", ancho: "min-w-[260px]" },
    { clave: "marca", titulo: "Marca" },
    { clave: "categoria", titulo: "Categoría" },
    { clave: "cantidad", titulo: "Por llegar", tipo: "numero", sumar: true },
    {
      clave: "fecha",
      titulo: "Fecha prevista",
      tipo: "fecha",
      mostrar: (f) =>
        f.fecha ? (
          <span className={f.fecha < hoy ? "text-amber-700 font-medium" : ""} title={f.fecha < hoy ? "La fecha ya pasó" : undefined}>
            {fechaCorta(f.fecha)}
          </span>
        ) : (
          <span className="text-slate-300">—</span>
        ),
    },
    { clave: "documentos", titulo: "Orden / packing list", ancho: "min-w-[160px]" },
    { clave: "proveedor", titulo: "Proveedor", ancho: "min-w-[160px]" },
    { clave: "stock", titulo: "Stock actual", tipo: "numero", sumar: true },
    {
      clave: "ventas",
      titulo: "¿Se ha vendido?",
      mostrar: (f) => (
        <span
          className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${
            f.vendido ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-violet-50 text-violet-700 border-violet-200"
          }`}
        >
          {f.vendido ? "Sí" : "No, es nuevo aquí"}
        </span>
      ),
    },
    { clave: "ultimaVenta", titulo: "Última venta", tipo: "fecha" },
    { clave: "unidades12m", titulo: "Und vendidas 12 meses", tipo: "numero" },
    { clave: "otrasSedes", titulo: "Vendido en otras sedes", excel: (f) => f.otrasSedes.join(", "), mostrar: (f) => f.otrasSedes.join(", ") || <span className="text-slate-300">—</span> },
    {
      clave: "productId",
      titulo: "",
      soloPantalla: true,
      mostrar: (f) =>
        f.vendido && f.productId ? (
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setDetalle(f)}>
            Ver ventas
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <EncabezadoAdmin
        icono={<Truck className="h-7 w-7 text-blue-600" />}
        titulo="Por llegar"
        subtitulo="Productos en camino, cuántos vienen y si ya se vendieron antes en la sede"
        empresa={empresa}
        setEmpresa={setEmpresa}
        conMes={false}
      />

      <EstadoCarga cargando={cargando} error={error} />

      {!cargando && !error && datos && (
        <>
          {datos.data.avisos.map((a) => (
            <Aviso key={a}>{a}: la lista de Valencia puede estar incompleta.</Aviso>
          ))}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Tarjeta titulo="Productos por llegar" valor={resumen.productos.toLocaleString("en-US")} tono="azul" />
            <Tarjeta titulo="Unidades por llegar" valor={resumen.unidades.toLocaleString("en-US")} />
            <Tarjeta
              titulo="Nunca vendidos en la sede"
              valor={resumen.nuevos.toLocaleString("en-US")}
              detalle="Productos nuevos para esa sede"
              tono={resumen.nuevos > 0 ? "verde" : "neutro"}
            />
            <Tarjeta
              titulo="Con la fecha ya pasada"
              valor={resumen.atrasados.toLocaleString("en-US")}
              detalle="Fecha prevista anterior a hoy"
              tono={resumen.atrasados > 0 ? "ambar" : "neutro"}
            />
          </div>

          <TablaReporte
            filas={filas}
            columnas={columnas}
            buscarEn={(f) => `${f.codigo} ${f.producto} ${f.documentos} ${f.proveedor}`}
            filtros={[
              { clave: "ventas", titulo: "¿Se ha vendido?" },
              { clave: "origen", titulo: "Origen" },
              { clave: "marca", titulo: "Marca" },
              { clave: "categoria", titulo: "Categoría" },
              ...(empresa === "" ? [{ clave: "sedeNombre" as const, titulo: "Sede" }] : []),
            ]}
            archivo={`por-llegar-${empresa || "todas"}`}
          />

          <Aviso tono="azul">
            Por llegar: lo pendiente de recibir de las órdenes de compra de Odoo en el almacén principal de cada sede y, en
            Valencia, los packing list que Compras cargó y todavía no se cerraron (con su fecha estimada). Si un producto está
            en una orden y en un packing list se cuenta una vez. «¿Se ha vendido?» mira las facturas de la sede en Odoo y, antes
            de abril 2026, en Smartbit; sin servicios ni ventas entre empresas del grupo.
          </Aviso>
        </>
      )}

      {detalle && <DetalleVentas fila={detalle} onCerrar={() => setDetalle(null)} />}
    </div>
  );
}

const COLUMNAS_VENTAS: Columna<VentaProducto>[] = [
  { clave: "fecha", titulo: "Fecha", tipo: "fecha" },
  { clave: "factura", titulo: "Factura" },
  { clave: "cliente", titulo: "Cliente", ancho: "min-w-[220px]" },
  { clave: "cantidad", titulo: "Cantidad", tipo: "numero", sumar: true },
  { clave: "total", titulo: "Total USD", tipo: "dinero", sumar: true },
  { clave: "fuente", titulo: "Sistema" },
];

function DetalleVentas({ fila, onCerrar }: { fila: Fila; onCerrar: () => void }) {
  const [ventas, setVentas] = useState<VentaProducto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/inteligencia-negocio/por-llegar/ventas?producto=${fila.productId}&sede=${fila.sede}`)
      .then((r) => r.json())
      .then((j) => {
        if (!vivo) return;
        if (j?.success) setVentas(j.data.ventas);
        else setError(j?.error || "No se pudieron cargar las ventas");
      })
      .catch(() => vivo && setError("No se pudieron cargar las ventas"));
    return () => {
      vivo = false;
    };
  }, [fila.productId, fila.sede]);

  const resumen = useMemo(() => {
    const v = ventas ?? [];
    const facturas = v.filter((x) => x.cantidad > 0);
    return {
      unidades: v.reduce((s, x) => s + x.cantidad, 0),
      total: v.reduce((s, x) => s + x.total, 0),
      facturas: new Set(facturas.map((x) => `${x.fuente}|${x.factura}|${x.fecha}`)).size,
      clientes: new Set(facturas.map((x) => x.cliente)).size,
      primera: facturas.length ? facturas[facturas.length - 1].fecha : null,
    };
  }, [ventas]);

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Receipt className="h-4 w-4 text-blue-600" />
            Ventas en {fila.sedeNombre}: {fila.producto}
          </DialogTitle>
          <p className="text-xs text-slate-500">
            {fila.codigo} · {fila.marca} · por llegar {fila.cantidad.toLocaleString("en-US")} · stock {fila.stock.toLocaleString("en-US")}
          </p>
        </DialogHeader>

        {!ventas && !error && (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" /> Leyendo las ventas...
          </div>
        )}
        {error && <Aviso tono="rojo">{error}</Aviso>}
        {ventas && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Tarjeta titulo="Unidades vendidas" valor={resumen.unidades.toLocaleString("en-US")} detalle="Menos devoluciones" />
              <Tarjeta titulo="Venta total" valor={money(resumen.total)} detalle="USD sin IVA" />
              <Tarjeta titulo="Facturas" valor={resumen.facturas.toLocaleString("en-US")} detalle={`${resumen.clientes.toLocaleString("en-US")} clientes`} />
              <Tarjeta
                titulo="Vendido entre"
                valor={<span className="text-base">{fechaCorta(resumen.primera)} – {fechaCorta(fila.ultimaVenta)}</span>}
              />
            </div>
            <TablaReporte
              filas={ventas}
              columnas={COLUMNAS_VENTAS}
              buscarEn={(v) => `${v.factura} ${v.cliente}`}
              filtros={[{ clave: "fuente", titulo: "Sistema" }]}
              archivo={`ventas-${fila.codigo}-${fila.sedeNombre}`}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
