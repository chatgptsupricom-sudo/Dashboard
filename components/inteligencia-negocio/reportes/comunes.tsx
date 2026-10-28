"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BotonExcel, FilaVacia, fechaCorta, money } from "@/components/administracion/comunes";
import { ArrowDown, ArrowUp, Search } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

/**
 * Piezas comunes de los reportes de Inteligencia de Negocio
 * (lib/inteligencia-negocio/reportes.ts): sede de Venezuela, meses desde el
 * corte de Odoo y una tabla con búsqueda, filtros, orden, totales y Excel.
 */

export const SEDES_VE = [
  { value: "venezuela", label: "Venezuela (consolidado)" },
  { value: "valencia", label: "Valencia" },
  { value: "caracas", label: "Caracas" },
];

export const NOMBRE_SEDE_ID: Record<number, string> = { 9: "Valencia", 10: "Caracas" };

/** Primer mes con la venta en Odoo (CORTE_ODOO de lib/smartbit.ts; antes está en Smartbit). */
const MES_INICIAL = "2026-04";

/** Meses desde el corte hasta el actual, el más reciente primero. */
export function mesesDisponibles(): { value: string; label: string }[] {
  const n = new Date();
  const meses = [];
  for (let d = new Date(n.getFullYear(), n.getMonth(), 1); ; d.setMonth(d.getMonth() - 1)) {
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (value < MES_INICIAL) break;
    meses.push({ value, label: d.toLocaleDateString("es-VE", { month: "long", year: "numeric" }) });
  }
  return meses;
}

export function EncabezadoReporte({
  icono,
  titulo,
  subtitulo,
  empresa,
  setEmpresa,
  children,
}: {
  icono: ReactNode;
  titulo: string;
  subtitulo: string;
  empresa: string;
  setEmpresa: (v: string) => void;
  /** Selector de mes (o meses). */
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
          {icono}
          {titulo}
        </h1>
        <p className="text-gray-500 text-sm">{subtitulo}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
        <select
          value={empresa}
          onChange={(e) => setEmpresa(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm bg-white flex-1 lg:flex-none"
          aria-label="Sede"
        >
          {SEDES_VE.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        {children}
      </div>
    </div>
  );
}

export function SelectorMes({ mes, setMes }: { mes: string; setMes: (v: string) => void }) {
  return (
    <select
      value={mes}
      onChange={(e) => setMes(e.target.value)}
      className="border rounded-lg px-3 py-2 text-sm capitalize flex-1 lg:flex-none bg-white"
      aria-label="Mes"
    >
      {mesesDisponibles().map((m) => (
        <option key={m.value} value={m.value}>
          {m.label}
        </option>
      ))}
    </select>
  );
}

/** Uno o más meses; "Acumulado" los marca todos. */
export function SelectorMeses({ meses, setMeses }: { meses: string[]; setMeses: (v: string[]) => void }) {
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

// ---------------------------------------------------------------------------
// Tabla
// ---------------------------------------------------------------------------

type Tipo = "texto" | "numero" | "dinero" | "porcentaje" | "fecha";

export interface Columna<T> {
  clave: keyof T & string;
  titulo: string;
  tipo?: Tipo;
  /** Suma la columna en la fila de totales. */
  sumar?: boolean;
  /** Texto a mostrar en vez del valor (ej. el nombre de la sede). */
  mostrar?: (fila: T) => ReactNode;
  /** Valor para el Excel, si no es el mismo de la fila. */
  excel?: (fila: T) => string | number | null;
  ancho?: string;
  /** Solo en pantalla (ej. un botón): no va al Excel ni se ordena. */
  soloPantalla?: boolean;
}

const POR_PAGINA = 200;

function formato(valor: unknown, tipo: Tipo = "texto"): ReactNode {
  if (valor === null || valor === undefined || valor === "") return <span className="text-slate-300">—</span>;
  const n = Number(valor);
  switch (tipo) {
    case "dinero":
      return money(n, 2);
    case "numero":
      return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
    case "porcentaje":
      return `${n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
    case "fecha":
      return fechaCorta(String(valor));
    default:
      return String(valor);
  }
}

const esNumerica = (tipo?: Tipo) => tipo === "numero" || tipo === "dinero" || tipo === "porcentaje";

export function TablaReporte<T extends Record<string, any>>({
  filas,
  columnas,
  buscarEn,
  filtros = [],
  archivo,
  ordenInicial,
  pie,
}: {
  filas: T[];
  columnas: Columna<T>[];
  /** Texto donde busca el buscador. */
  buscarEn: (fila: T) => string;
  /** Columnas con un desplegable para filtrar (marca, categoría…). */
  filtros?: { clave: keyof T & string; titulo: string }[];
  archivo: string;
  ordenInicial?: { clave: keyof T & string; desc: boolean };
  /** Celdas calculadas de la fila de totales (sobre lo filtrado), por clave. */
  pie?: (visibles: T[]) => Partial<Record<keyof T & string, ReactNode>>;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [valoresFiltro, setValoresFiltro] = useState<Record<string, string>>({});
  const [orden, setOrden] = useState(ordenInicial ?? null);
  const [mostrar, setMostrar] = useState(POR_PAGINA);

  const opcionesFiltro = useMemo(
    () =>
      Object.fromEntries(
        filtros.map((f) => [f.clave, [...new Set(filas.map((x) => String(x[f.clave] ?? "")))].filter(Boolean).sort()]),
      ),
    [filas, filtros],
  );

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const r = filas.filter(
      (f) =>
        (!q || buscarEn(f).toLowerCase().includes(q)) &&
        Object.entries(valoresFiltro).every(([k, v]) => !v || String(f[k] ?? "") === v),
    );
    if (orden) {
      const col = columnas.find((c) => c.clave === orden.clave);
      const numerica = esNumerica(col?.tipo);
      r.sort((a, b) => {
        const va = a[orden.clave];
        const vb = b[orden.clave];
        // Lo vacío siempre al final.
        if (va === null || va === undefined || va === "") return 1;
        if (vb === null || vb === undefined || vb === "") return -1;
        const c = numerica ? Number(va) - Number(vb) : String(va).localeCompare(String(vb));
        return orden.desc ? -c : c;
      });
    }
    return r;
  }, [filas, busqueda, valoresFiltro, orden, columnas, buscarEn]);

  const ordenarPor = (clave: keyof T & string) => {
    const col = columnas.find((c) => c.clave === clave);
    setOrden((o) => (o?.clave === clave ? { clave, desc: !o.desc } : { clave, desc: esNumerica(col?.tipo) }));
  };

  const totales = pie?.(visibles) ?? {};
  const hayPie = columnas.some((c) => c.sumar) || Object.keys(totales).length > 0;

  const hojaExcel = () => [
    {
      nombre: "Reporte",
      filas: visibles.map((f) =>
        Object.fromEntries(
          columnas.filter((c) => !c.soloPantalla).map((c) => [c.titulo, c.excel ? c.excel(f) : (f[c.clave] ?? "")]),
        ),
      ),
    },
  ];

  return (
    <Card className="bg-white">
      <CardContent className="p-0">
        <div className="flex flex-col md:flex-row md:items-center gap-2 p-3 border-b">
          <div className="relative flex-1 min-w-0">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value);
                setMostrar(POR_PAGINA);
              }}
              placeholder="Buscar…"
              className="pl-9 h-9"
            />
          </div>
          {filtros.map((f) => (
            <select
              key={f.clave}
              value={valoresFiltro[f.clave] ?? ""}
              onChange={(e) => {
                setValoresFiltro((v) => ({ ...v, [f.clave]: e.target.value }));
                setMostrar(POR_PAGINA);
              }}
              className="border rounded-lg px-3 h-9 text-sm bg-white md:max-w-[220px]"
              aria-label={f.titulo}
            >
              <option value="">{f.titulo}: todas</option>
              {opcionesFiltro[f.clave].map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          ))}
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-slate-500 tabular-nums whitespace-nowrap">
              {visibles.length.toLocaleString("en-US")} filas
            </span>
            <BotonExcel archivo={archivo} hojas={hojaExcel} />
          </div>
        </div>

        <div className="overflow-auto max-h-[70vh]">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-slate-50">
              <TableRow>
                {columnas.map((c) => (
                  <TableHead
                    key={c.clave}
                    onClick={() => !c.soloPantalla && ordenarPor(c.clave)}
                    className={`cursor-pointer select-none whitespace-nowrap text-xs ${esNumerica(c.tipo) ? "text-right" : ""} ${c.ancho ?? ""}`}
                  >
                    <span className="inline-flex items-center gap-1">
                      {c.titulo}
                      {orden?.clave === c.clave &&
                        (orden.desc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
                    </span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibles.length === 0 ? (
                <FilaVacia columnas={columnas.length} />
              ) : (
                visibles.slice(0, mostrar).map((f, i) => (
                  <TableRow key={i}>
                    {columnas.map((c) => (
                      <TableCell
                        key={c.clave}
                        className={`text-xs py-2 ${esNumerica(c.tipo) ? "text-right tabular-nums whitespace-nowrap" : ""} ${c.ancho ?? ""}`}
                      >
                        {c.mostrar ? c.mostrar(f) : formato(f[c.clave], c.tipo)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
            {hayPie && visibles.length > 0 && (
              <TableFooter className="sticky bottom-0 bg-slate-100">
                <TableRow>
                  {columnas.map((c, i) => (
                    <TableCell
                      key={c.clave}
                      className={`text-xs font-semibold py-2 ${esNumerica(c.tipo) ? "text-right tabular-nums whitespace-nowrap" : ""}`}
                    >
                      {c.clave in totales
                        ? totales[c.clave]
                        : c.sumar
                          ? formato(visibles.reduce((s, f) => s + (Number(f[c.clave]) || 0), 0), c.tipo)
                          : i === 0
                            ? "Total"
                            : ""}
                    </TableCell>
                  ))}
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </div>

        {visibles.length > mostrar && (
          <div className="p-3 border-t text-center">
            <Button variant="outline" size="sm" onClick={() => setMostrar((m) => m + POR_PAGINA)}>
              Mostrar {Math.min(POR_PAGINA, visibles.length - mostrar)} más ({(visibles.length - mostrar).toLocaleString("en-US")} sin mostrar)
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
