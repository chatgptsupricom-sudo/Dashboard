"use client";

import { Aviso, EstadoCarga, Tarjeta, money, useDatosAdmin } from "@/components/administracion/comunes";
import { Users } from "lucide-react";
import { useMemo, useState } from "react";
import type { Columna } from "./comunes";
import { EncabezadoReporte, TablaReporte, mesesDisponibles } from "./comunes";

type Fila = {
  id: number;
  rif: string;
  cliente: string;
  diasSinComprar: number | null;
  ultimaCompra: string | null;
  cupo: number;
  diasCredito: number;
  plazo: string;
  ventas: number;
  participacion: number;
  zona: string;
  vendedor: string;
};
type Datos = { success: true; data: { empresa: string; meses: string[]; clientes: Fila[] } };

const COLUMNAS: Columna<Fila>[] = [
  { clave: "rif", titulo: "RIF" },
  { clave: "cliente", titulo: "Razón social", ancho: "min-w-[240px]" },
  { clave: "diasSinComprar", titulo: "Días sin comprar", tipo: "numero" },
  { clave: "cupo", titulo: "Cupo de crédito", tipo: "dinero" },
  {
    clave: "diasCredito",
    titulo: "Días de crédito",
    tipo: "numero",
    mostrar: (f) => <span title={f.plazo}>{f.diasCredito || "Contado"}</span>,
  },
  { clave: "ventas", titulo: "Ventas $", tipo: "dinero", sumar: true },
  { clave: "participacion", titulo: "Participación en la venta %", tipo: "porcentaje", sumar: true },
  { clave: "zona", titulo: "Zona" },
  { clave: "vendedor", titulo: "Vendedor", ancho: "min-w-[160px]" },
];

/** Uno o más meses; "Acumulado" los marca todos. */
function SelectorMeses({ meses, setMeses }: { meses: string[]; setMeses: (v: string[]) => void }) {
  const opciones = mesesDisponibles();
  const todos = meses.length === opciones.length;
  const alternar = (m: string) => {
    if (meses.includes(m)) {
      if (meses.length > 1) setMeses(meses.filter((x) => x !== m));
    } else setMeses([...meses, m].sort());
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        onClick={() => setMeses(todos ? [opciones[0].value] : opciones.map((o) => o.value).sort())}
        className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${todos ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 hover:bg-slate-50"}`}
      >
        Acumulado
      </button>
      {[...opciones].reverse().map((o) => (
        <button
          key={o.value}
          onClick={() => alternar(o.value)}
          aria-pressed={meses.includes(o.value)}
          className={`px-3 py-1.5 rounded-full text-xs border capitalize transition-colors ${meses.includes(o.value) ? "bg-blue-50 text-blue-700 border-blue-300 font-medium" : "bg-white text-slate-500 hover:bg-slate-50"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Reporte III: lo comprado por cada cliente en uno o más meses (lib/inteligencia-negocio/reportes.ts). */
export function ReporteClientes() {
  const [empresa, setEmpresa] = useState("venezuela");
  const [meses, setMeses] = useState<string[]>(() => [mesesDisponibles()[0].value]);
  const { datos, cargando, error } = useDatosAdmin<Datos>("/api/inteligencia-negocio/reportes/clientes", empresa, meses.join(","));
  const clientes = useMemo(() => datos?.data.clientes ?? [], [datos]);

  const resumen = useMemo(() => {
    const total = clientes.reduce((s, c) => s + c.ventas, 0);
    // Cuántos clientes hacen el 80 % de la venta (vienen ordenados por venta).
    let acumulado = 0;
    let top = 0;
    for (const c of clientes) {
      if (acumulado >= total * 0.8) break;
      acumulado += c.ventas;
      top++;
    }
    return { total, top, sinComprar30: clientes.filter((c) => (c.diasSinComprar ?? 0) > 30).length };
  }, [clientes]);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <EncabezadoReporte
          icono={<Users className="h-7 w-7 text-blue-600" />}
          titulo="Clientes"
          subtitulo="Venta por cliente en los meses elegidos, en USD sin IVA"
          empresa={empresa}
          setEmpresa={setEmpresa}
        />
        <SelectorMeses meses={meses} setMeses={setMeses} />
      </div>

      <EstadoCarga cargando={cargando} error={error} />

      {!cargando && !error && datos && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Tarjeta titulo="Venta del período" valor={money(resumen.total)} tono="azul" />
            <Tarjeta titulo="Clientes que compraron" valor={clientes.length.toLocaleString("en-US")} />
            <Tarjeta titulo="Hacen el 80 % de la venta" valor={resumen.top.toLocaleString("en-US")} detalle="Clientes" />
            <Tarjeta titulo="Más de 30 días sin comprar" valor={resumen.sinComprar30.toLocaleString("en-US")} detalle="Clientes, a hoy" />
          </div>

          <TablaReporte
            filas={clientes}
            columnas={COLUMNAS}
            buscarEn={(f) => `${f.rif} ${f.cliente}`}
            filtros={[
              { clave: "zona", titulo: "Zona" },
              { clave: "vendedor", titulo: "Vendedor" },
            ]}
            archivo={`clientes-${empresa}-${meses.join("_")}`}
            ordenInicial={{ clave: "ventas", desc: true }}
          />

          <Aviso tono="azul">
            Ventas: facturas menos notas de crédito de los meses elegidos, sin servicios ni empresas del grupo. Días sin
            comprar: desde la última factura en la sede elegida hasta hoy. Cupo y días de crédito: los de Odoo para el
            cliente (con las dos sedes, el cupo es la suma y los días los del plazo más largo). Zona: el estado del
            cliente en Odoo. Vendedor: el asignado al cliente en Odoo.
          </Aviso>
        </>
      )}
    </div>
  );
}
