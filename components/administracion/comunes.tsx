"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TableCell, TableRow } from "@/components/ui/table";
import { AlertTriangle, Download, Loader2, WifiOff } from "lucide-react";
import { ReactNode, useCallback, useEffect, useState } from "react";
import { useAuthStore } from "@/lib/stores/auth.store";
import * as XLSX from "xlsx";

/**
 * Piezas comunes de las pantallas de solo lectura del rol Administracion
 * (Cuentas por Pagar, Tesoreria, Fiscal, Contabilidad): mismo filtro de sede
 * y mes, mismas tarjetas y el mismo manejo de "Odoo no responde".
 */

export const SEDES_ADMIN = [
  { value: "", label: "Todas las sedes" },
  { value: "valencia", label: "Valencia" },
  { value: "caracas", label: "Caracas" },
  { value: "panama", label: "Panamá" },
];

export const NOMBRE_SEDE: Record<string, string> = {
  valencia: "Valencia",
  caracas: "Caracas",
  panama: "Panamá",
};

const EMPRESA_DE_CIDS: Record<number, string> = { 9: "valencia", 10: "caracas", 7: "panama" };
const ROLES_SEDE_FIJA = ["administracion", "administración", "administracion y finanzas", "administración y finanzas"];

/**
 * Sede fija del usuario: el rol Administracion solo ve la de su `cids` (las
 * APIs lo imponen igual; esto solo evita ofrecerle un selector que no sirve).
 * null = el usuario elige sede (superadmin).
 */
export function useSedeFija(): { empresa: string; companyId: number | null } | null {
  const { user } = useAuthStore();
  const rol = String((user as any)?.role || "").toLowerCase().trim();
  if (!ROLES_SEDE_FIJA.includes(rol)) return null;
  const cids = Number((user as any)?.cids);
  return EMPRESA_DE_CIDS[cids] ? { empresa: EMPRESA_DE_CIDS[cids], companyId: cids } : { empresa: "", companyId: null };
}

/** Selector de sede, o la sede fija del usuario si no puede elegir. */
export function SelectorSede({
  empresa,
  setEmpresa,
  className = "",
}: {
  empresa: string;
  setEmpresa: (v: string) => void;
  className?: string;
}) {
  const fija = useSedeFija();
  useEffect(() => {
    if (fija && fija.empresa && empresa !== fija.empresa) setEmpresa(fija.empresa);
  }, [fija?.empresa, empresa, setEmpresa]); // eslint-disable-line react-hooks/exhaustive-deps
  if (fija) {
    return (
      <span className={`border rounded-lg px-3 py-2 text-sm bg-slate-50 text-slate-700 ${className}`}>
        {fija.empresa ? NOMBRE_SEDE[fija.empresa] : "Sin sede asignada"}
      </span>
    );
  }
  return (
    <select
      value={empresa}
      onChange={(e) => setEmpresa(e.target.value)}
      className={`border rounded-lg px-3 py-2 text-sm bg-white ${className}`}
      aria-label="Sede"
    >
      {SEDES_ADMIN.map((s) => (
        <option key={s.value} value={s.value}>
          {s.label}
        </option>
      ))}
    </select>
  );
}

export function mesActual(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
}

export function mesesRecientes(cantidad = 12) {
  const now = new Date();
  return Array.from({ length: cantidad }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return {
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("es-VE", { month: "long", year: "numeric" }),
    };
  });
}

export function money(n: number | null | undefined, decimales = 0): string {
  const v = Number(n) || 0;
  const txt = Math.abs(v).toLocaleString("en-US", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
  return `${v < 0 ? "-" : ""}$${txt}`;
}

export function fechaCorta(fecha: string | null | undefined): string {
  if (!fecha) return "—";
  const [a, m, d] = fecha.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

/** Carga una API del area con el filtro de sede y mes. */
export function useDatosAdmin<T>(ruta: string, empresa: string, mes: string, extra = "") {
  const [datos, setDatos] = useState<T | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<{ mensaje: string; odooCaido: boolean } | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(`${ruta}?empresa=${empresa}&mes=${mes}${extra}`);
      const json = await res.json();
      if (json.success) {
        setDatos(json as T);
      } else {
        setDatos(null);
        setError({ mensaje: json.error || "No se pudieron cargar los datos", odooCaido: !!json.odooUnreachable });
      }
    } catch {
      setDatos(null);
      setError({ mensaje: "No se pudieron cargar los datos", odooCaido: false });
    }
    setCargando(false);
  }, [ruta, empresa, mes, extra]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return { datos, cargando, error, recargar: cargar };
}

export function EncabezadoAdmin({
  icono,
  titulo,
  subtitulo,
  empresa,
  setEmpresa,
  mes,
  setMes,
  conMes = true,
  acciones,
}: {
  icono: ReactNode;
  titulo: string;
  subtitulo: string;
  empresa: string;
  setEmpresa: (v: string) => void;
  mes?: string;
  setMes?: (v: string) => void;
  conMes?: boolean;
  acciones?: ReactNode;
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
        <SelectorSede empresa={empresa} setEmpresa={setEmpresa} className="flex-1 lg:flex-none" />
        {conMes && mes !== undefined && setMes && (
          <select
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm capitalize flex-1 lg:flex-none bg-white"
            aria-label="Mes"
          >
            {mesesRecientes().map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        )}
        {acciones}
      </div>
    </div>
  );
}

const TONOS = {
  neutro: "bg-white",
  azul: "bg-blue-50/60 border-blue-100",
  verde: "bg-emerald-50/60 border-emerald-100",
  ambar: "bg-amber-50/60 border-amber-200",
  rojo: "bg-red-50/60 border-red-200",
};

export function Tarjeta({
  titulo,
  valor,
  detalle,
  tono = "neutro",
}: {
  titulo: string;
  valor: ReactNode;
  detalle?: ReactNode;
  tono?: keyof typeof TONOS;
}) {
  return (
    <Card className={TONOS[tono]}>
      <CardContent className="p-4">
        <p className="text-xs text-gray-500 font-medium">{titulo}</p>
        <p className="text-xl sm:text-2xl font-bold text-gray-800 mt-0.5 break-words">{valor}</p>
        {detalle && <p className="text-[11px] text-gray-500 mt-1">{detalle}</p>}
      </CardContent>
    </Card>
  );
}

export function EstadoCarga({
  cargando,
  error,
  texto = "Leyendo Odoo...",
}: {
  cargando: boolean;
  error: { mensaje: string; odooCaido: boolean } | null;
  texto?: string;
}) {
  if (cargando) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600 mb-3" />
        <p className="text-gray-500">{texto}</p>
      </div>
    );
  }
  if (error) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-gray-600 flex flex-col items-center gap-2">
          {error.odooCaido ? (
            <WifiOff className="h-6 w-6 text-red-500" />
          ) : (
            <AlertTriangle className="h-6 w-6 text-amber-500" />
          )}
          <p className="font-medium">
            {error.odooCaido ? "Odoo no respondió. Intenta de nuevo en unos minutos." : error.mensaje}
          </p>
        </CardContent>
      </Card>
    );
  }
  return null;
}

export function Aviso({ children, tono = "ambar" }: { children: ReactNode; tono?: "ambar" | "rojo" | "azul" }) {
  const estilos = {
    ambar: "bg-amber-50 border-amber-200 text-amber-900",
    rojo: "bg-red-50 border-red-200 text-red-900",
    azul: "bg-blue-50 border-blue-200 text-blue-900",
  };
  return (
    <div className={`flex items-start gap-3 p-3 sm:p-4 rounded-xl border text-sm ${estilos[tono]}`}>
      <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0 opacity-70" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Descarga varias hojas en un solo Excel. */
export function BotonExcel({
  archivo,
  hojas,
}: {
  archivo: string;
  hojas: () => { nombre: string; filas: Record<string, any>[] }[];
}) {
  const descargar = () => {
    const wb = XLSX.utils.book_new();
    hojas().forEach((h) => {
      const ws = XLSX.utils.json_to_sheet(h.filas.length ? h.filas : [{ "Sin datos": "" }]);
      XLSX.utils.book_append_sheet(wb, ws, h.nombre.slice(0, 31));
    });
    XLSX.writeFile(wb, `${archivo}.xlsx`);
  };
  return (
    <Button variant="outline" size="sm" onClick={descargar} className="h-9">
      <Download className="h-4 w-4 mr-2" />
      Excel
    </Button>
  );
}

/** Pestañas simples (botones), sin depender del estado de la URL. */
export function Pestanas<T extends string>({
  opciones,
  valor,
  onChange,
}: {
  opciones: { value: T; label: string; contador?: number }[];
  valor: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b">
      {opciones.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`px-3 sm:px-4 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${
            valor === o.value
              ? "border-blue-600 text-blue-700 font-medium"
              : "border-transparent text-gray-500 hover:text-gray-800"
          }`}
        >
          {o.label}
          {o.contador !== undefined && (
            <span className="ml-1.5 text-xs rounded-full bg-slate-100 px-1.5 py-0.5 text-slate-600">
              {o.contador}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export function FilaVacia({ columnas, texto = "Sin resultados." }: { columnas: number; texto?: string }) {
  return (
    <TableRow>
      <TableCell colSpan={columnas} className="text-center py-8 text-gray-500">
        {texto}
      </TableCell>
    </TableRow>
  );
}

// Semanas y paginacion de las conciliaciones (Binance y bancos).

const DIA = 86400_000;
export const POR_PAGINA = 25;

/** Anterior / Pagina x de y / Siguiente; no se muestra con una sola pagina. */
export function Paginacion({ pagina, total, cambiar }: { pagina: number; total: number; cambiar: (p: number) => void }) {
  const paginas = Math.ceil(total / POR_PAGINA);
  if (paginas <= 1) return null;
  return (
    <div className="flex items-center justify-end gap-2 pt-3 text-sm text-gray-600">
      <span>
        {pagina * POR_PAGINA + 1}–{Math.min(total, (pagina + 1) * POR_PAGINA)} de {total}
      </span>
      <Button size="sm" variant="outline" className="h-8" disabled={pagina === 0} onClick={() => cambiar(pagina - 1)}>
        Anterior
      </Button>
      <span>
        Página {pagina + 1} de {paginas}
      </span>
      <Button
        size="sm"
        variant="outline"
        className="h-8"
        disabled={pagina >= paginas - 1}
        onClick={() => cambiar(pagina + 1)}
      >
        Siguiente
      </Button>
    </div>
  );
}

export const deLaPagina = <T,>(items: T[], pagina: number) => items.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);

/** Lunes (YYYY-MM-DD) de las ultimas `n` semanas, la actual primero. */
export function semanas(n = 12) {
  const hoy = new Date();
  const lunes = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()));
  lunes.setUTCDate(lunes.getUTCDate() - ((lunes.getUTCDay() + 6) % 7));
  const f = (d: Date) => d.toISOString().slice(0, 10);
  const corto = (d: Date) => `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(lunes.getTime() - i * 7 * DIA);
    return { value: f(d), label: `${corto(d)} al ${corto(new Date(d.getTime() + 6 * DIA))}/${d.getUTCFullYear()}` };
  });
}
