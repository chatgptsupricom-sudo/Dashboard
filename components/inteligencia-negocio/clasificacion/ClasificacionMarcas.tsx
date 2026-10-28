"use client";

import { Aviso, EstadoCarga, Tarjeta, money, useDatosAdmin } from "@/components/administracion/comunes";
import type { FilaMarca } from "@/lib/inteligencia-negocio/clasificacion/tipos";
import { Award } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import type { Columna } from "../reportes/comunes";
import { EncabezadoReporte, SelectorMes, TablaReporte, mesesDisponibles } from "../reportes/comunes";

type Datos = { success: true; data: { empresa: string; mes: string; filas: FilaMarca[] } };

const COLUMNAS: Columna<FilaMarca>[] = [
  { clave: "marca", titulo: "Marca" },
  { clave: "categoria", titulo: "Categoría" },
  { clave: "subcategoria", titulo: "Subcategoría (nombre corto)", ancho: "min-w-[240px]" },
  { clave: "productos", titulo: "Productos", tipo: "numero" },
  { clave: "venta", titulo: "Venta $", tipo: "dinero", sumar: true },
  { clave: "pctMarca", titulo: "% de la marca", tipo: "porcentaje" },
  { clave: "unidades", titulo: "Und vendidas", tipo: "numero", sumar: true },
  { clave: "margen", titulo: "Margen %", tipo: "porcentaje" },
  { clave: "inventario", titulo: "Inventario al cierre", tipo: "numero", sumar: true },
];

function margenDe(filas: FilaMarca[]): number | null {
  let venta = 0;
  let costo = 0;
  for (const f of filas) {
    if (f.costoVendido <= 0) continue;
    venta += f.venta;
    costo += f.costoVendido;
  }
  return venta > 0 ? ((venta - costo) / venta) * 100 : null;
}

const porcentaje = (n: number | null) => (n === null ? "—" : `${n.toFixed(1)}%`);

/** Clasificación por marca: cada marca por categoría y nombre corto (lib/inteligencia-negocio/clasificacion/marcas.ts). */
export function ClasificacionMarcas() {
  const [empresa, setEmpresa] = useState("venezuela");
  const [mes, setMes] = useState(() => mesesDisponibles()[0].value);
  const { datos, cargando, error } = useDatosAdmin<Datos>("/api/inteligencia-negocio/clasificacion/marcas", empresa, mes);
  const filas = useMemo(() => datos?.data.filas ?? [], [datos]);
  const pathname = usePathname();

  const resumen = useMemo(() => {
    const venta = filas.reduce((s, f) => s + f.venta, 0);
    const sinClasificar = filas.filter((f) => f.subcategoria === "Sin clasificar").reduce((s, f) => s + f.venta, 0);
    return {
      venta,
      marcas: new Set(filas.filter((f) => f.venta > 0).map((f) => f.marca)).size,
      sinClasificarPct: venta > 0 ? (sinClasificar / venta) * 100 : 0,
      margen: margenDe(filas),
    };
  }, [filas]);

  return (
    <div className="space-y-6">
      <EncabezadoReporte
        icono={<Award className="h-7 w-7 text-blue-600" />}
        titulo="Clasificación por marca"
        subtitulo="Venta, margen e inventario de cada marca por categoría y nombre corto"
        empresa={empresa}
        setEmpresa={setEmpresa}
      >
        <SelectorMes mes={mes} setMes={setMes} />
      </EncabezadoReporte>

      <EstadoCarga cargando={cargando} error={error} texto="Leyendo Odoo (el inventario al cierre tarda un poco)..." />

      {!cargando && !error && datos && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Tarjeta titulo="Venta del mes" valor={money(resumen.venta)} tono="azul" />
            <Tarjeta titulo="Marcas con venta" valor={resumen.marcas.toLocaleString("en-US")} />
            <Tarjeta titulo="Margen" valor={porcentaje(resumen.margen)} detalle="De lo vendido con costo" />
            <Tarjeta
              titulo="Venta sin clasificar"
              valor={porcentaje(resumen.sinClasificarPct)}
              tono={resumen.sinClasificarPct > 5 ? "ambar" : "neutro"}
              detalle="Productos sin nombre corto todavía"
            />
          </div>

          {resumen.sinClasificarPct > 0 && (
            <Aviso>
              Hay venta de productos que todavía no tienen nombre corto: salen como "Sin clasificar" con su categoría de Odoo.
              Clasifícalos en{" "}
              <Link href={pathname.replace(/\/marcas$/, "/productos")} className="font-medium underline">
                Clasificación de productos
              </Link>
              .
            </Aviso>
          )}

          <TablaReporte
            filas={filas}
            columnas={COLUMNAS}
            buscarEn={(f) => `${f.marca} ${f.categoria} ${f.subcategoria}`}
            filtros={[
              { clave: "marca", titulo: "Marca" },
              { clave: "categoria", titulo: "Categoría" },
            ]}
            archivo={`clasificacion-marcas-${empresa}-${mes}`}
            pie={(visibles) => ({ margen: porcentaje(margenDe(visibles)) })}
          />

          <Aviso tono="azul">
            Venta en USD sin IVA, menos notas de crédito, sin las empresas del grupo (igual que Reportes › Productos). Margen =
            (venta − costo de lo vendido) ÷ venta. Inventario: unidades en el almacén principal al cierre del mes. % de la marca =
            qué parte de la venta de la marca en el mes es de ese nombre corto.
          </Aviso>
        </>
      )}
    </div>
  );
}
