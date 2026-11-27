"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Aviso, EstadoCarga, Pestanas } from "@/components/administracion/comunes";
import { TablaReporte, type Columna } from "@/components/inteligencia-negocio/reportes/comunes";
import { fecha, num, pedir, usd } from "@/components/rotacion-inventario/comunes";
import { nombreSede, type VentaPlanRojo } from "@/lib/rotacion-inventario/tipos";

/**
 * Cada venta de la mercancía del plan para salir del rojo: a quién, quién la
 * vendió, a qué precio y margen, de contado o a crédito (con su plazo) y si ya
 * se cobró. GET /api/rotacion-inventario/ventas-rojo.
 */

export interface FiltroVentas {
  tipo: "sede" | "marca" | "categoria" | "producto";
  clave: string;
}

type Vista = "ventas" | "clientes" | "vendedores" | "productos";
type Fila = VentaPlanRojo & { sede: string; producto: string };

interface Agrupado {
  clave: string;
  ventas: number;
  facturas: number;
  unidades: number;
  cuentaCuota: number;
  venta: number;
  margen: number;
  margenPct: number | null;
  credito: number;
  pctCredito: number | null;
  diasCredito: number | null;
  porCobrar: number;
  vencido: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function agrupar(filas: Fila[], claveDe: (f: Fila) => string): Agrupado[] {
  const grupos = new Map<string, Fila[]>();
  for (const f of filas) {
    const k = claveDe(f) || "—";
    const l = grupos.get(k) ?? [];
    l.push(f);
    grupos.set(k, l);
  }
  return [...grupos].map(([clave, l]) => resumen(clave, l)).sort((a, b) => b.venta - a.venta);
}

function resumen(clave: string, l: Fila[]): Agrupado {
  const venta = r2(l.reduce((a, f) => a + f.venta, 0));
  const margen = r2(l.reduce((a, f) => a + f.margen, 0));
  const cred = l.filter((f) => f.condicion === "Crédito");
  const credito = r2(cred.reduce((a, f) => a + f.venta, 0));
  // Días de crédito ponderados por lo vendido.
  const conDias = cred.filter((f) => f.diasCredito !== null && f.venta > 0);
  const base = conDias.reduce((a, f) => a + f.venta, 0);
  // El saldo es de la factura entera: una vez por factura.
  const facturas = new Map(l.map((f) => [f.moveId, f]));
  const porCobrar = r2([...facturas.values()].reduce((a, f) => a + (f.tipo === "Factura" ? f.saldo : 0), 0));
  const vencido = r2([...facturas.values()].reduce((a, f) => a + (f.tipo === "Factura" && f.diasVencida > 0 ? f.saldo : 0), 0));
  return {
    clave,
    ventas: l.length,
    facturas: new Set(l.filter((f) => f.tipo === "Factura").map((f) => f.moveId)).size,
    unidades: r2(l.reduce((a, f) => a + f.cantidad, 0)),
    cuentaCuota: r2(l.reduce((a, f) => a + f.cuentaCuota, 0)),
    venta,
    margen,
    margenPct: venta ? Math.round((margen / venta) * 1000) / 10 : null,
    credito,
    pctCredito: venta ? Math.round((credito / venta) * 1000) / 10 : null,
    diasCredito: base > 0 ? Math.round(conDias.reduce((a, f) => a + (f.diasCredito ?? 0) * f.venta, 0) / base) : null,
    porCobrar,
    vencido,
  };
}

const COLUMNAS_VENTAS: Columna<Fila>[] = [
  { clave: "fecha", titulo: "Fecha", tipo: "fecha" },
  {
    clave: "factura",
    titulo: "Documento",
    mostrar: (f) => (
      <span className="whitespace-nowrap">
        {f.urlOdoo ? (
          <a href={f.urlOdoo} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline inline-flex items-center gap-1">
            {f.factura} <ExternalLink className="h-3 w-3" />
          </a>
        ) : (
          f.factura
        )}
        {f.tipo === "Nota de crédito" && <span className="block text-[10px] text-red-600">Nota de crédito</span>}
        {f.pedido && <span className="block text-[10px] text-slate-400">{f.pedido}</span>}
      </span>
    ),
  },
  { clave: "sede", titulo: "Sede" },
  {
    clave: "cliente",
    titulo: "Cliente",
    mostrar: (f) => (
      <span>
        {f.cliente}
        {f.rif && <span className="block text-[10px] text-slate-400">{f.rif}</span>}
      </span>
    ),
  },
  { clave: "rif", titulo: "RIF", soloExcel: true },
  { clave: "vendedor", titulo: "Vendedor" },
  { clave: "codigo", titulo: "Código" },
  { clave: "nombre", titulo: "Producto", ancho: "min-w-[220px]" },
  { clave: "marca", titulo: "Marca" },
  { clave: "cantidad", titulo: "Unidades", tipo: "numero", sumar: true },
  { clave: "cuentaCuota", titulo: "Cuentan p/ cuota", tipo: "numero", sumar: true },
  { clave: "precioUnitario", titulo: "Precio unit. (sin IVA)", tipo: "dinero" },
  { clave: "venta", titulo: "Venta (sin IVA)", tipo: "dinero", sumar: true },
  { clave: "costoTotal", titulo: "Costo", tipo: "dinero", sumar: true },
  { clave: "margen", titulo: "Margen", tipo: "dinero", sumar: true },
  { clave: "margenPct", titulo: "Margen %", tipo: "porcentaje" },
  { clave: "condicion", titulo: "Condición" },
  { clave: "plazo", titulo: "Plazo de pago" },
  { clave: "diasCredito", titulo: "Días de crédito", tipo: "numero" },
  { clave: "vence", titulo: "Vence", tipo: "fecha" },
  {
    clave: "estadoPago",
    titulo: "Cobro",
    mostrar: (f) => (
      <span className="whitespace-nowrap">
        {f.estadoPago}
        {f.diasVencida > 0 && <span className="block text-[10px] text-red-600">Vencida hace {f.diasVencida} días</span>}
      </span>
    ),
  },
  { clave: "saldo", titulo: "Saldo de la factura", tipo: "dinero" },
  { clave: "diasVencida", titulo: "Días vencida", tipo: "numero", soloExcel: true },
];

const columnasGrupo = (titulo: string): Columna<Agrupado>[] => [
  { clave: "clave", titulo, ancho: "min-w-[220px]" },
  { clave: "facturas", titulo: "Facturas", tipo: "numero", sumar: true },
  { clave: "unidades", titulo: "Unidades", tipo: "numero", sumar: true },
  { clave: "cuentaCuota", titulo: "Cuentan p/ cuota", tipo: "numero", sumar: true },
  { clave: "venta", titulo: "Venta (sin IVA)", tipo: "dinero", sumar: true },
  { clave: "margen", titulo: "Margen", tipo: "dinero", sumar: true },
  { clave: "margenPct", titulo: "Margen %", tipo: "porcentaje" },
  { clave: "credito", titulo: "A crédito", tipo: "dinero", sumar: true },
  { clave: "pctCredito", titulo: "% a crédito", tipo: "porcentaje" },
  { clave: "diasCredito", titulo: "Días de crédito (prom.)", tipo: "numero" },
  { clave: "porCobrar", titulo: "Por cobrar", tipo: "dinero", sumar: true },
  { clave: "vencido", titulo: "Vencido", tipo: "dinero", sumar: true },
];

function Dato({ titulo, valor, detalle }: { titulo: string; valor: string; detalle?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-[11px] text-slate-500">{titulo}</p>
      <p className="text-lg font-bold text-gray-800">{valor}</p>
      {detalle && <p className="text-[11px] text-slate-500">{detalle}</p>}
    </div>
  );
}

export default function VentasRojoDialog({
  sede,
  filtro,
  cerrar,
}: {
  sede: string;
  filtro: FiltroVentas | null;
  cerrar: () => void;
}) {
  const [datos, setDatos] = useState<{ planes: { companyId: number; inicio: string }[]; ventas: VentaPlanRojo[] } | null>(null);
  const [error, setError] = useState<{ mensaje: string; odooCaido: boolean } | null>(null);
  const [vista, setVista] = useState<Vista>("ventas");

  useEffect(() => {
    pedir<{ planes: { companyId: number; inicio: string }[]; ventas: VentaPlanRojo[] }>(`/api/rotacion-inventario/ventas-rojo?sede=${sede}`)
      .then(setDatos)
      .catch((e) => setError({ mensaje: e.message, odooCaido: !!e.odooCaido }));
  }, [sede]);

  const filas: Fila[] = useMemo(() => {
    const todas = (datos?.ventas ?? []).map((v) => ({
      ...v,
      sede: nombreSede(v.companyId),
      producto: [v.codigo, v.nombre].filter(Boolean).join(" · "),
    }));
    if (!filtro) return todas;
    return todas.filter((f) =>
      filtro.tipo === "sede" ? f.sede === filtro.clave : filtro.tipo === "marca" ? f.marca === filtro.clave : filtro.tipo === "categoria" ? f.categoria === filtro.clave : f.producto === filtro.clave,
    );
  }, [datos, filtro]);

  const total = useMemo(() => resumen("Total", filas), [filas]);
  const contado = r2(total.venta - total.credito);
  const inicios = [...new Set((datos?.planes ?? []).map((p) => p.inicio))];

  return (
    <Dialog open onOpenChange={(o) => !o && cerrar()}>
      <DialogContent className="sm:max-w-[min(90rem,calc(100vw-2rem))] max-h-[92vh] overflow-y-auto overflow-x-hidden grid-cols-1 [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle className="pr-6">Lo vendido de la mercancía en rojo{filtro ? ` · ${filtro.clave}` : ""}</DialogTitle>
          <DialogDescription>
            Cada factura de los productos que estaban en rojo al arrancar el plan
            {inicios.length === 1 ? ` (desde el ${fecha(inicios[0])})` : ""}. Venta y precio en USD sin IVA; las notas de crédito restan.
            Margen sobre el costo del día que arrancó el plan.
          </DialogDescription>
        </DialogHeader>

        <EstadoCarga cargando={!datos && !error} error={error} />

        {datos && !filas.length && <Aviso tono="azul">Todavía no se ha vendido nada de esta mercancía desde que arrancó el plan.</Aviso>}

        {datos && filas.length > 0 && (
          <div className="space-y-4 min-w-0">
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
              <Dato titulo="Vendido (sin IVA)" valor={usd(total.venta)} detalle={`${num(total.facturas)} facturas · ${num(total.unidades)} unidades`} />
              <Dato titulo="Cuentan para la cuota" valor={`${num(total.cuentaCuota)} u.`} detalle="Con tope en lo que había en rojo" />
              <Dato
                titulo="Margen"
                valor={usd(total.margen)}
                detalle={total.margenPct === null ? undefined : `${total.margenPct.toFixed(1)}% sobre la venta`}
              />
              <Dato
                titulo="Contado / crédito"
                valor={`${total.pctCredito === null ? "—" : (100 - total.pctCredito).toFixed(0)}% / ${total.pctCredito === null ? "—" : total.pctCredito.toFixed(0)}%`}
                detalle={`${usd(contado)} de contado · ${usd(total.credito)} a crédito`}
              />
              <Dato
                titulo="Días de crédito (promedio)"
                valor={total.diasCredito === null ? "—" : `${total.diasCredito} días`}
                detalle="De lo vendido a crédito, ponderado por monto"
              />
              <Dato
                titulo="Por cobrar de esas facturas"
                valor={usd(total.porCobrar)}
                detalle={total.vencido > 0 ? `${usd(total.vencido)} vencido` : "Nada vencido"}
              />
            </div>

            <Pestanas<Vista>
              valor={vista}
              onChange={setVista}
              opciones={[
                { value: "ventas", label: "Cada venta", contador: filas.length },
                { value: "clientes", label: "Por cliente" },
                { value: "vendedores", label: "Por vendedor" },
                { value: "productos", label: "Por producto" },
              ]}
            />

            {vista === "ventas" && (
              <TablaReporte
                filas={filas}
                columnas={COLUMNAS_VENTAS}
                buscarEn={(f) => `${f.factura} ${f.pedido} ${f.cliente} ${f.rif} ${f.vendedor} ${f.codigo} ${f.nombre} ${f.marca}`}
                filtros={[
                  { clave: "vendedor", titulo: "Vendedor" },
                  { clave: "marca", titulo: "Marca" },
                  { clave: "condicion", titulo: "Condición" },
                  { clave: "estadoPago", titulo: "Cobro" },
                  ...(new Set(filas.map((f) => f.sede)).size > 1 ? [{ clave: "sede" as const, titulo: "Sede" }] : []),
                ]}
                archivo="ventas-mercancia-en-rojo"
                ordenInicial={{ clave: "fecha", desc: true }}
              />
            )}
            {vista === "clientes" && (
              <TablaReporte
                filas={agrupar(filas, (f) => (f.rif ? `${f.cliente} (${f.rif})` : f.cliente))}
                columnas={columnasGrupo("Cliente")}
                buscarEn={(g) => g.clave}
                archivo="ventas-rojo-por-cliente"
                ordenInicial={{ clave: "venta", desc: true }}
              />
            )}
            {vista === "vendedores" && (
              <TablaReporte
                filas={agrupar(filas, (f) => f.vendedor)}
                columnas={columnasGrupo("Vendedor")}
                buscarEn={(g) => g.clave}
                archivo="ventas-rojo-por-vendedor"
                ordenInicial={{ clave: "venta", desc: true }}
              />
            )}
            {vista === "productos" && (
              <TablaReporte
                filas={agrupar(filas, (f) => f.producto)}
                columnas={columnasGrupo("Producto")}
                buscarEn={(g) => g.clave}
                archivo="ventas-rojo-por-producto"
                ordenInicial={{ clave: "venta", desc: true }}
              />
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
