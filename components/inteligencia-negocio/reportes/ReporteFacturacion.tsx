"use client";

import { Aviso, EstadoCarga, Tarjeta, money, useDatosAdmin } from "@/components/administracion/comunes";
import { Receipt } from "lucide-react";
import { useMemo, useState } from "react";
import type { Columna } from "./comunes";
import { EncabezadoReporte, NOMBRE_SEDE_ID, SelectorMes, TablaReporte, mesesDisponibles } from "./comunes";

type Linea = {
  sede: number;
  fecha: string;
  factura: string;
  rif: string;
  cliente: string;
  cantidad: number;
  precio: number;
  total: number;
  codigo: string;
  marca: string;
  categoria: string;
  producto: string;
};
type Datos = { success: true; data: { empresa: string; mes: string; lineas: Linea[] } };

const nombreSede = (f: Linea) => NOMBRE_SEDE_ID[f.sede] ?? String(f.sede);

/** Reporte I: cada renglón de producto facturado en el mes (lib/inteligencia-negocio/reportes.ts). */
export function ReporteFacturacion() {
  const [empresa, setEmpresa] = useState("venezuela");
  const [mes, setMes] = useState(() => mesesDisponibles()[0].value);
  const { datos, cargando, error } = useDatosAdmin<Datos>("/api/inteligencia-negocio/reportes/facturacion", empresa, mes);
  const lineas = useMemo(() => datos?.data.lineas ?? [], [datos]);

  const columnas = useMemo<Columna<Linea>[]>(
    () => [
      ...(empresa === "venezuela" ? [{ clave: "sede", titulo: "Sede", mostrar: nombreSede, excel: nombreSede } as Columna<Linea>] : []),
      { clave: "fecha", titulo: "Fecha de la factura", tipo: "fecha" },
      { clave: "factura", titulo: "Número de factura" },
      { clave: "rif", titulo: "RIF" },
      { clave: "cliente", titulo: "Nombre cliente", ancho: "min-w-[220px]" },
      { clave: "cantidad", titulo: "Cantidad", tipo: "numero", sumar: true },
      { clave: "precio", titulo: "Precio", tipo: "dinero" },
      { clave: "total", titulo: "Total USD", tipo: "dinero", sumar: true },
      { clave: "codigo", titulo: "Número de parte" },
      { clave: "marca", titulo: "Marca" },
      { clave: "categoria", titulo: "Categoría", ancho: "min-w-[160px]" },
      { clave: "producto", titulo: "Descripción del producto", ancho: "min-w-[280px]" },
    ],
    [empresa],
  );

  const resumen = useMemo(
    () => ({
      total: lineas.reduce((s, l) => s + l.total, 0),
      facturas: new Set(lineas.map((l) => `${l.sede}|${l.factura}`)).size,
      clientes: new Set(lineas.map((l) => l.rif || l.cliente)).size,
      unidades: lineas.reduce((s, l) => s + l.cantidad, 0),
    }),
    [lineas],
  );

  return (
    <div className="space-y-6">
      <EncabezadoReporte
        icono={<Receipt className="h-7 w-7 text-blue-600" />}
        titulo="Facturación"
        subtitulo="Cada producto facturado en el mes, en USD sin IVA"
        empresa={empresa}
        setEmpresa={setEmpresa}
      >
        <SelectorMes mes={mes} setMes={setMes} />
      </EncabezadoReporte>

      <EstadoCarga cargando={cargando} error={error} />

      {!cargando && !error && datos && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Tarjeta titulo="Venta del mes" valor={money(resumen.total)} tono="azul" />
            <Tarjeta titulo="Facturas" valor={resumen.facturas.toLocaleString("en-US")} />
            <Tarjeta titulo="Clientes" valor={resumen.clientes.toLocaleString("en-US")} />
            <Tarjeta titulo="Unidades" valor={resumen.unidades.toLocaleString("en-US")} />
          </div>

          <TablaReporte
            filas={lineas}
            columnas={columnas}
            buscarEn={(f) => `${f.factura} ${f.rif} ${f.cliente} ${f.codigo} ${f.producto}`}
            filtros={[
              { clave: "marca", titulo: "Marca" },
              { clave: "categoria", titulo: "Categoría" },
            ]}
            archivo={`facturacion-${empresa}-${mes}`}
          />

          <Aviso tono="azul">
            Facturas y notas de crédito de cliente publicadas en Odoo (las notas de crédito restan, con cantidad y total en
            negativo). Sin servicios ni ventas a las empresas del grupo. Precio = total del renglón ÷ cantidad, ya con el
            descuento.
          </Aviso>
        </>
      )}
    </div>
  );
}
