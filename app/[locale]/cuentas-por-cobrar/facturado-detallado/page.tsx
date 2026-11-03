"use client";

import { Aviso, EstadoCarga, Tarjeta, money, useDatosAdmin } from "@/components/administracion/comunes";
import { SelectorMes, TablaReporte, mesesDisponibles, type Columna } from "@/components/inteligencia-negocio/reportes/comunes";
import type { LineaFacturado } from "@/lib/cxc/facturadoDetallado";
import { useAuthStore } from "@/lib/stores/auth.store";
import { FileText } from "lucide-react";
import { useMemo, useState } from "react";

// Facturado detallado: el reporte "Facturación de Productos" de Odoo, de
// cualquier mes y con Excel (lib/cxc/facturadoDetallado.ts).

type Datos = { success: true; data: { mes: string; companyIds: number[]; lineas: LineaFacturado[] } };

const NOMBRE_SEDE: Record<number, string> = { 9: "Valencia", 10: "Caracas", 7: "Panamá" };
const SEDES = [
  { value: "valencia", label: "Valencia" },
  { value: "caracas", label: "Caracas" },
  { value: "panama", label: "Panamá" },
  { value: "todas", label: "Todas las sedes" },
];
const nombreSede = (f: LineaFacturado) => NOMBRE_SEDE[f.sede] ?? String(f.sede);

export default function FacturadoDetalladoPage() {
  const { user } = useAuthStore();
  // Solo el SuperAdmin elige sede; los demás ven la de su `cids` (lo impone la API).
  const eligeSede = String((user as any)?.role || "").toLowerCase().trim() === "superadmin";
  const [sede, setSede] = useState("valencia");
  const [mes, setMes] = useState(() => mesesDisponibles()[0].value);
  const empresa = eligeSede && sede !== "todas" ? sede : "";
  const { datos, cargando, error } = useDatosAdmin<Datos>("/api/superadmin/cuentas-por-cobrar/facturado-detallado", empresa, mes);
  const lineas = useMemo(() => datos?.data.lineas ?? [], [datos]);
  const variasSedes = (datos?.data.companyIds.length ?? 0) > 1;

  const columnas = useMemo<Columna<LineaFacturado>[]>(
    () => [
      ...(variasSedes ? [{ clave: "sede", titulo: "Sede", mostrar: nombreSede, excel: nombreSede } as Columna<LineaFacturado>] : []),
      { clave: "fecha", titulo: "Fecha factura", tipo: "fecha" },
      { clave: "factura", titulo: "Número de factura" },
      { clave: "rif", titulo: "RIF cliente" },
      { clave: "cliente", titulo: "Cliente", ancho: "min-w-[220px]" },
      { clave: "zona", titulo: "Zona geográfica" },
      { clave: "direccion", titulo: "Dirección", ancho: "min-w-[220px]" },
      { clave: "marca", titulo: "Marca" },
      { clave: "codigo", titulo: "Código producto" },
      { clave: "descripcion", titulo: "Descripción del producto", ancho: "min-w-[280px]" },
      { clave: "cantidad", titulo: "Cantidad vendida", tipo: "numero", sumar: true },
      { clave: "costo", titulo: "Costo unitario", tipo: "dinero" },
      { clave: "precio", titulo: "Precio de venta", tipo: "numero" },
      { clave: "total", titulo: "Total x ítem", tipo: "numero" },
      { clave: "moneda", titulo: "Moneda" },
      { clave: "totalUsd", titulo: "Total USD", tipo: "dinero", sumar: true },
      { clave: "vendedor", titulo: "Vendedor" },
    ],
    [variasSedes],
  );

  const resumen = useMemo(
    () => ({
      totalUsd: lineas.reduce((s, l) => s + l.totalUsd, 0),
      facturas: new Set(lineas.map((l) => `${l.sede}|${l.factura}`)).size,
      clientes: new Set(lineas.map((l) => l.rif || l.cliente)).size,
      unidades: lineas.reduce((s, l) => s + (l.tipo === "nota_credito" ? -l.cantidad : l.cantidad), 0),
    }),
    [lineas],
  );

  const sedeTexto = datos ? datos.data.companyIds.map((id) => NOMBRE_SEDE[id] ?? id).join(", ") : "";

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <FileText className="h-7 w-7 text-blue-600" />
            Facturado detallado
          </h1>
          <p className="text-gray-500 text-sm">
            Cada producto facturado en el mes, como el reporte «Facturación de Productos» de Odoo
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          {eligeSede ? (
            <select
              value={sede}
              onChange={(e) => setSede(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm bg-white flex-1 lg:flex-none"
              aria-label="Sede"
            >
              {SEDES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          ) : (
            sedeTexto && <span className="border rounded-lg px-3 py-2 text-sm bg-slate-50">{sedeTexto}</span>
          )}
          <SelectorMes mes={mes} setMes={setMes} />
        </div>
      </div>

      <EstadoCarga cargando={cargando} error={error} />

      {!cargando && !error && datos && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Tarjeta titulo="Facturado del mes (USD sin IVA)" valor={money(resumen.totalUsd)} tono="azul" />
            <Tarjeta titulo="Facturas y notas de crédito" valor={resumen.facturas.toLocaleString("en-US")} />
            <Tarjeta titulo="Clientes" valor={resumen.clientes.toLocaleString("en-US")} />
            <Tarjeta titulo="Unidades (netas)" valor={resumen.unidades.toLocaleString("en-US")} />
          </div>

          <TablaReporte
            filas={lineas}
            columnas={columnas}
            buscarEn={(f) => `${f.factura} ${f.rif} ${f.cliente} ${f.codigo} ${f.descripcion} ${f.vendedor}`}
            filtros={[
              { clave: "marca", titulo: "Marca" },
              { clave: "vendedor", titulo: "Vendedor" },
              { clave: "zona", titulo: "Zona" },
            ]}
            archivo={`facturado-detallado-${empresa || "sede"}-${mes}`}
          />

          <Aviso tono="azul">
            Los mismos renglones que el reporte de Odoo: productos de facturas y notas de crédito de cliente publicadas,
            por la fecha contable del mes. Precio, costo y «Total x ítem» van como en Odoo, en la moneda de la factura
            y con la nota de crédito en positivo; «Total USD» es el mismo renglón en dólares y la nota de crédito resta.
          </Aviso>
        </>
      )}
    </div>
  );
}
