"use client";

import { Calendar, ChevronLeft, ChevronRight, RefreshCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { XLSX, estilizarHoja } from "@/lib/excel";
import { useSedeFija } from "@/components/administracion/comunes";
import type { FilaIntegracion } from "@/lib/cxc/integracionPagos";

/**
 * Integración de Pagos: el mismo reporte de Odoo (Contabilidad > Reportes >
 * Integración de Pagos), con sus columnas y sus totales (lib/cxc/integracionPagos.ts).
 * La usan CxC, Administración, el SuperAdmin y el Gerente de Operaciones.
 */

type Respuesta = {
  results: FilaIntegracion[];
  total_count: number;
  total_monto: number;
  companies?: { cid: string; name: string }[];
  vendedores?: string[];
};

const POR_PAGINA = 25;

// Las columnas de la vista `lista.conciliaciones.personalizada` de Odoo, en su orden.
const COLUMNAS: { titulo: string; valor: (f: FilaIntegracion) => string | number; fecha?: boolean; monto?: boolean }[] = [
  { titulo: "Nº Pago", valor: (f) => f.pago },
  { titulo: "Tipo de Documento", valor: (f) => f.tipo_documento },
  { titulo: "Documento", valor: (f) => f.rif },
  { titulo: "Cliente", valor: (f) => f.cliente },
  { titulo: "Nº Factura", valor: (f) => f.factura },
  { titulo: "Fecha Factura", valor: (f) => f.fecha_factura, fecha: true },
  { titulo: "Importe Conciliado", valor: (f) => f.importe, monto: true },
  { titulo: "Vendedor", valor: (f) => f.vendedor },
  { titulo: "Fecha Aplicación", valor: (f) => f.fecha_aplicacion, fecha: true },
  { titulo: "Fecha Pago", valor: (f) => f.fecha_pago, fecha: true },
  { titulo: "Término Pago de la Factura", valor: (f) => f.termino_pago },
  { titulo: "Descripción", valor: (f) => f.descripcion },
  { titulo: "Fecha Vencimiento", valor: (f) => f.fecha_vencimiento, fecha: true },
  { titulo: "Diario de Pago", valor: (f) => f.diario },
];

const dia = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");
const dinero = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const dos = (n: number) => String(n).padStart(2, "0");

export function IntegracionPagos({ api, eligeSede }: { api: string; eligeSede: boolean }) {
  const [datos, setDatos] = useState<Respuesta>({ results: [], total_count: 0, total_monto: 0 });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cid, setCid] = useState("9");
  // Administración solo ve la sede de su cids (la API también lo impone).
  const sedeFija = useSedeFija();
  useEffect(() => {
    if (sedeFija?.companyId && String(sedeFija.companyId) !== cid) setCid(String(sedeFija.companyId));
  }, [sedeFija?.companyId, cid]);
  const [companies, setCompanies] = useState<{ cid: string; name: string }[]>([]);
  const [vendedores, setVendedores] = useState<string[]>([]);
  const [vendedor, setVendedor] = useState("all");
  const [buscar, setBuscar] = useState("");
  const [porFecha, setPorFecha] = useState<"aplicacion" | "pago">("aplicacion");
  // Mes/Año, o un rango de fechas a mano: el mismo filtro de Contado/Crédito.
  const hoy = new Date();
  const [mes, setMes] = useState(hoy.getMonth() + 1);
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [usarRango, setUsarRango] = useState(false);
  const [inicio, setInicio] = useState("");
  const [fin, setFin] = useState("");
  const conRango = usarRango && !!inicio && !!fin;
  const desde = conRango ? inicio : `${anio}-${dos(mes)}-01`;
  const hasta = conRango ? fin : `${anio}-${dos(mes)}-${dos(new Date(anio, mes, 0).getDate())}`;
  const anios = Array.from({ length: hoy.getFullYear() - 2024 }, (_, i) => 2025 + i);
  const [pagina, setPagina] = useState(1);
  // «Excluir impuestos»: retenciones, 25% de IVA, IGTF e ISLR (lib/cxc/impuestos.ts).
  const [sinImpuestos, setSinImpuestos] = useState(false);

  const parametros = (extra: Record<string, string>) =>
    new URLSearchParams({
      ...(eligeSede ? { cid } : {}),
      search: buscar,
      vendedor,
      fecha: porFecha,
      fechaInicio: desde,
      fechaFin: hasta,
      ...(sinImpuestos ? { sinImpuestos: "1" } : {}),
      ...extra,
    });

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setError(null);
    fetch(`${api}?${parametros({ page: String(pagina), limit: String(POR_PAGINA) })}`)
      .then((r) => r.json())
      .then((j) => {
        if (!vigente) return;
        if (j.error) return setError(j.error);
        setDatos(j);
        if (j.companies) {
          setCompanies(j.companies);
          // La API solo devuelve las sedes que el usuario puede ver: si pidió otra, queda en la suya.
          if (j.companies.length && !j.companies.some((c: { cid: string }) => c.cid === cid)) setCid(j.companies[0].cid);
        }
        if (j.vendedores) setVendedores(j.vendedores);
      })
      .catch(() => vigente && setError("No se pudo cargar el reporte"))
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [api, cid, pagina, buscar, vendedor, porFecha, desde, hasta, sinImpuestos]); // eslint-disable-line react-hooks/exhaustive-deps

  const exportar = async () => {
    setCargando(true);
    try {
      const j: Respuesta = await (await fetch(`${api}?${parametros({ page: "1", limit: "1000000" })}`)).json();
      const filas = (j.results || []).map((f) =>
        Object.fromEntries(COLUMNAS.map((c) => [c.titulo, c.fecha ? dia(String(c.valor(f))) : c.valor(f)])),
      );
      const hoja = XLSX.utils.json_to_sheet(filas);
      hoja["!cols"] = COLUMNAS.map((c) => ({ wch: c.titulo === "Cliente" || c.titulo === "Descripción" ? 35 : 18 }));
      estilizarHoja(hoja);
      const libro = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(libro, hoja, "Integración de Pagos");
      XLSX.writeFile(libro, `Integracion_de_Pagos_${desde}_${hasta}.xlsx`);
    } catch {
      setError("No se pudo exportar el Excel");
    } finally {
      setCargando(false);
    }
  };

  const total = datos.total_count || 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const desdeFila = total === 0 ? 0 : (pagina - 1) * POR_PAGINA + 1;
  const hastaFila = Math.min(pagina * POR_PAGINA, total);
  const cambiar = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPagina(1);
  };

  return (
    <div className="space-y-6 p-4 md:p-6 bg-slate-50/50 min-h-screen flex flex-col font-sans text-slate-900">
      <div>
        <h1 className="text-2xl md:text-3xl font-black tracking-tighter uppercase">
          Integración <span className="text-blue-600">de Pagos</span>
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          El mismo reporte de Odoo (Contabilidad › Reportes › Integración de Pagos): toda conciliación contra una factura
          o nota de crédito de cliente, también retenciones y notas de crédito aplicadas.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-7 gap-3 bg-white p-4 rounded-3xl shadow-sm border border-slate-100 items-center">
        {eligeSede && (
          <select
            className="bg-slate-50 border-none rounded-xl text-[10px] font-bold p-3 outline-none"
            value={cid}
            disabled={!!sedeFija || companies.length <= 1}
            onChange={(e) => cambiar(setCid)(e.target.value)}
            aria-label="Sede"
          >
            {companies.length ? (
              companies.map((c) => (
                <option key={c.cid} value={c.cid}>
                  {c.name}
                </option>
              ))
            ) : (
              <option value="9">Cargando empresas...</option>
            )}
          </select>
        )}
        <select
          className="bg-slate-50 border-none rounded-xl text-[10px] font-bold p-3 outline-none"
          value={vendedor}
          onChange={(e) => cambiar(setVendedor)(e.target.value)}
          aria-label="Vendedor"
        >
          <option value="all">Todos los vendedores</option>
          {vendedores.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <select
          className="bg-slate-50 border-none rounded-xl text-[10px] font-bold p-3 outline-none"
          value={porFecha}
          onChange={(e) => cambiar(setPorFecha)(e.target.value as "aplicacion" | "pago")}
          aria-label="Filtrar por fecha"
        >
          <option value="aplicacion">Por fecha de aplicación</option>
          <option value="pago">Por fecha de pago</option>
        </select>
        {!usarRango ? (
          <div className="md:col-span-2 flex items-center gap-1 bg-slate-50 rounded-xl px-3 py-2">
            <Calendar size={14} className="text-slate-400 shrink-0" />
            <select
              value={mes}
              onChange={(e) => cambiar(setMes)(parseInt(e.target.value))}
              className="text-sm bg-transparent border-none outline-none text-slate-700"
              aria-label="Mes"
            >
              {MESES.map((m, i) => (
                <option key={m} value={i + 1} disabled={anio === hoy.getFullYear() && i > hoy.getMonth()}>
                  {m}
                </option>
              ))}
            </select>
            <select
              value={anio}
              onChange={(e) => cambiar(setAnio)(parseInt(e.target.value))}
              className="text-sm bg-transparent border-none outline-none text-slate-700 ml-1"
              aria-label="Año"
            >
              {anios.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <button
              onClick={() => setUsarRango(true)}
              className="text-xs text-blue-600 hover:underline ml-auto"
              title="Usar un rango de fechas específico en vez de mes/año"
            >
              Rango
            </button>
          </div>
        ) : (
          <div className="md:col-span-2 flex items-center gap-1 bg-slate-50 rounded-xl px-3 py-2">
            <Calendar size={14} className="text-slate-400 shrink-0" />
            <input
              type="date"
              value={inicio}
              onChange={(e) => cambiar(setInicio)(e.target.value)}
              className="text-sm bg-transparent border-none outline-none text-slate-700 min-w-0"
              aria-label="Desde"
            />
            <span className="text-slate-300">–</span>
            <input
              type="date"
              value={fin}
              onChange={(e) => cambiar(setFin)(e.target.value)}
              className="text-sm bg-transparent border-none outline-none text-slate-700 min-w-0"
              aria-label="Hasta"
            />
            <button
              onClick={() => cambiar(setUsarRango)(false)}
              className="text-xs text-blue-600 hover:underline ml-auto"
              title="Volver a filtrar por mes/año"
            >
              Mes/Año
            </button>
          </div>
        )}
        <input
          value={buscar}
          onChange={(e) => cambiar(setBuscar)(e.target.value)}
          placeholder="Cliente, factura, pago o RIF"
          className="bg-slate-50 rounded-xl text-[10px] font-bold p-3 outline-none"
          aria-label="Buscar"
        />
        <button
          onClick={exportar}
          disabled={cargando}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-[20px] text-[10px] uppercase tracking-widest transition-all"
        >
          Exportar Excel
        </button>
      </div>

      <label
        className="flex w-fit items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 cursor-pointer select-none"
        title="Saca las retenciones y los pagos cuya descripción o diario dicen IVA (25% de IVA), IGTF, ISLR o retención. Los pagos y abonos de facturas se quedan."
      >
        <input
          type="checkbox"
          checked={sinImpuestos}
          onChange={(e) => {
            setSinImpuestos(e.target.checked);
            setPagina(1);
          }}
          className="accent-blue-600"
        />
        Excluir impuestos
      </label>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden relative flex flex-col w-full min-h-[350px]">
        {cargando && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/60 backdrop-blur-[2px] z-10">
            <RefreshCcw className="animate-spin text-blue-600 mb-4" size={40} />
          </div>
        )}
        <div className="overflow-x-auto flex-1 bg-white">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-100">
                {COLUMNAS.map((c) => (
                  <th
                    key={c.titulo}
                    className={`px-3 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap ${c.monto ? "text-right" : ""}`}
                  >
                    {c.titulo}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {!cargando && datos.results.length === 0 && (
                <tr>
                  <td colSpan={COLUMNAS.length} className="px-3 py-10 text-center text-xs text-slate-400">
                    No hay conciliaciones en ese rango.
                  </td>
                </tr>
              )}
              {datos.results.map((f) => (
                <tr key={f.id} className="hover:bg-blue-50/30 transition-colors text-[10px]">
                  {COLUMNAS.map((c) => {
                    const v = c.valor(f);
                    return (
                      <td
                        key={c.titulo}
                        className={`px-3 py-3 ${c.monto ? "text-right font-black text-slate-900 whitespace-nowrap" : c.fecha ? "text-slate-500 whitespace-nowrap" : "text-slate-700"} ${c.titulo === "Descripción" ? "min-w-[220px]" : ""}`}
                      >
                        {c.monto ? dinero(Number(v)) : c.fecha ? dia(String(v)) : v || "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-8 py-4 bg-white border-t border-slate-100 flex flex-wrap gap-3 items-center justify-between">
          <div className="text-[10px] font-black text-slate-400 uppercase">
            Mostrando {desdeFila} - {hastaFila} de {total}
            <span className="ml-3 text-slate-700 normal-case">Total importe conciliado: {dinero(datos.total_monto || 0)}</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              disabled={pagina === 1}
              onClick={() => setPagina((p) => p - 1)}
              className="w-8 h-8 flex items-center justify-center rounded-full border hover:bg-blue-600 hover:text-white disabled:opacity-20 transition-all"
              aria-label="Página anterior"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="text-xs font-bold text-slate-700">
              {pagina} / {paginas}
            </div>
            <button
              disabled={pagina >= paginas}
              onClick={() => setPagina((p) => p + 1)}
              className="w-8 h-8 flex items-center justify-center rounded-full border hover:bg-blue-600 hover:text-white disabled:opacity-20 transition-all"
              aria-label="Página siguiente"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
