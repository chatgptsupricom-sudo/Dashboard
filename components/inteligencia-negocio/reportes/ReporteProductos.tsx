"use client";

import { Aviso, EstadoCarga, Tarjeta, money, useDatosAdmin } from "@/components/administracion/comunes";
import { Package } from "lucide-react";
import { useMemo, useState } from "react";
import type { Columna } from "./comunes";
import { EncabezadoReporte, SelectorMes, TablaReporte, mesesDisponibles } from "./comunes";

type Fila = {
  id: number;
  codigo: string;
  producto: string;
  ultimoIngreso: string | null;
  marca: string;
  categoria: string;
  costo: number | null;
  margen: number | null;
  venta: number;
  unidades: number;
  inventario: number;
};
type Datos = { success: true; data: { empresa: string; mes: string; productos: Fila[] } };

const COLUMNAS: Columna<Fila>[] = [
  { clave: "codigo", titulo: "Número de parte" },
  { clave: "producto", titulo: "Producto", ancho: "min-w-[280px]" },
  { clave: "ultimoIngreso", titulo: "Última fecha de ingreso", tipo: "fecha" },
  { clave: "marca", titulo: "Marca" },
  { clave: "categoria", titulo: "Categoría", ancho: "min-w-[160px]" },
  { clave: "costo", titulo: "Costo del producto", tipo: "dinero" },
  { clave: "margen", titulo: "Margen de ganancia %", tipo: "porcentaje" },
  { clave: "venta", titulo: "Venta $", tipo: "dinero", sumar: true },
  { clave: "unidades", titulo: "Und vendidas", tipo: "numero", sumar: true },
  { clave: "inventario", titulo: "Inventario al cierre de mes", tipo: "numero", sumar: true },
];

/** Margen del conjunto: solo los productos con venta y costo. */
function margenTotal(filas: Fila[]): number | null {
  let venta = 0;
  let costo = 0;
  for (const f of filas) {
    if (f.margen === null || f.costo === null) continue;
    venta += f.venta;
    costo += f.costo * f.unidades;
  }
  return venta > 0 ? ((venta - costo) / venta) * 100 : null;
}

const porcentaje = (n: number | null) => (n === null ? "—" : `${n.toFixed(1)}%`);

/** Reporte II: todo el catálogo con venta, costo, margen e inventario al cierre del mes. */
export function ReporteProductos() {
  const [empresa, setEmpresa] = useState("venezuela");
  const [mes, setMes] = useState(() => mesesDisponibles()[0].value);
  const { datos, cargando, error } = useDatosAdmin<Datos>("/api/inteligencia-negocio/reportes/productos", empresa, mes);
  const productos = useMemo(() => datos?.data.productos ?? [], [datos]);

  const resumen = useMemo(
    () => ({
      venta: productos.reduce((s, p) => s + p.venta, 0),
      conVenta: productos.filter((p) => p.unidades > 0).length,
      conStock: productos.filter((p) => p.inventario > 0).length,
      margen: margenTotal(productos),
    }),
    [productos],
  );

  return (
    <div className="space-y-6">
      <EncabezadoReporte
        icono={<Package className="h-7 w-7 text-blue-600" />}
        titulo="Productos"
        subtitulo="Todos los productos, con o sin inventario: venta, margen e inventario al cierre del mes"
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
            <Tarjeta titulo="Margen" valor={porcentaje(resumen.margen)} detalle="De los productos con venta y costo" />
            <Tarjeta titulo="Productos vendidos" valor={resumen.conVenta.toLocaleString("en-US")} />
            <Tarjeta
              titulo="Productos con inventario"
              valor={resumen.conStock.toLocaleString("en-US")}
              detalle={`De ${productos.length.toLocaleString("en-US")} en el catálogo`}
            />
          </div>

          <TablaReporte
            filas={productos}
            columnas={COLUMNAS}
            buscarEn={(f) => `${f.codigo} ${f.producto}`}
            filtros={[
              { clave: "marca", titulo: "Marca" },
              { clave: "categoria", titulo: "Categoría" },
            ]}
            archivo={`productos-${empresa}-${mes}`}
            pie={(visibles) => ({ margen: porcentaje(margenTotal(visibles)) })}
          />

          <Aviso tono="azul">
            Venta en USD sin IVA, menos notas de crédito, sin las empresas del grupo. Costo: el promedio de lo vendido en el
            mes según Odoo; si no se vendió, el costo actual del producto en Odoo. Margen = (venta − costo de lo vendido) ÷
            venta. Inventario: unidades en el almacén principal al cierre del último día del mes (hoy, si es el mes en
            curso). Último ingreso: la última recepción de compra o traslado entre sedes hasta ese día.
          </Aviso>
        </>
      )}
    </div>
  );
}
