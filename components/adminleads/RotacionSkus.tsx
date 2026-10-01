"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Download,
  Gauge,
  Loader2,
  Search,
} from "lucide-react";

type Estado = "alta" | "media" | "baja";

type Fila = {
  sku: string;
  nombre: string;
  marca: string;
  categoria: string;
  stock: number;
  vendidas30: number;
  vendidas60: number;
  coberturaDias: number | null;
  diasSinVenta: number | null;
  estado: Estado;
  rankingCategoria: number;
};

type Respuesta = {
  success: boolean;
  filas: Fila[];
  categorias: string[];
  marcas: string[];
  periodo: { desde: string; hasta: string };
};

const ESTADO_META: Record<
  Estado,
  { label: string; clase: string; ayuda: string }
> = {
  alta: {
    label: "Alta rotación",
    clase: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    ayuda: "Se vende rápido y el stock no alcanza para mucho. Destacar como “el que no puede faltar”.",
  },
  media: {
    label: "Rotación media",
    clase: "bg-slate-100 text-slate-600 ring-slate-200",
    ayuda: "Ventas estables, stock sano. Contenido regular.",
  },
  baja: {
    label: "Baja / Estancado",
    clase: "bg-red-50 text-red-700 ring-red-200",
    ayuda: "Sin ventas recientes o con stock para meses. Contenido específico para moverlo.",
  },
};

type SortCol =
  | "nombre"
  | "marca"
  | "categoria"
  | "stock"
  | "vendidas30"
  | "vendidas60"
  | "coberturaDias"
  | "rankingCategoria";

const MAX_FILAS = 200;

export function RotacionSkus() {
  const [data, setData] = useState<Respuesta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [categoria, setCategoria] = useState("");
  const [marca, setMarca] = useState("");
  const [estado, setEstado] = useState<"" | Estado>("");
  const [sort, setSort] = useState<{ col: SortCol; dir: "asc" | "desc" }>({
    col: "vendidas30",
    dir: "desc",
  });

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/adminleads/rotacion");
        const json = await res.json();
        if (cancel) return;
        if (!res.ok || !json.success) {
          setError(json.error || "No se pudo cargar el reporte");
          return;
        }
        setData(json);
      } catch {
        if (!cancel) setError("No se pudo cargar el reporte");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  const filtradas = useMemo(() => {
    if (!data) return [];
    const term = q.trim().toLowerCase();
    const rows = data.filas.filter((f) => {
      if (categoria && f.categoria !== categoria) return false;
      if (marca && f.marca !== marca) return false;
      if (estado && f.estado !== estado) return false;
      if (term && !`${f.sku} ${f.nombre} ${f.marca}`.toLowerCase().includes(term))
        return false;
      return true;
    });
    const dir = sort.dir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      const av = a[sort.col];
      const bv = b[sort.col];
      if (typeof av === "string" || typeof bv === "string") {
        return String(av).localeCompare(String(bv)) * dir;
      }
      // null (cobertura infinita) al fondo siempre
      if (av === null) return 1;
      if (bv === null) return -1;
      return ((av as number) - (bv as number)) * dir;
    });
    return rows;
  }, [data, q, categoria, marca, estado, sort]);

  const conteos = useMemo(() => {
    const base = data?.filas ?? [];
    return {
      total: base.length,
      alta: base.filter((f) => f.estado === "alta").length,
      media: base.filter((f) => f.estado === "media").length,
      baja: base.filter((f) => f.estado === "baja").length,
    };
  }, [data]);

  const exportUrl = (formato: "xlsx" | "csv") => {
    const p = new URLSearchParams({ formato });
    if (categoria) p.set("categoria", categoria);
    if (marca) p.set("marca", marca);
    if (estado) p.set("estado", estado);
    if (q.trim()) p.set("q", q.trim());
    return `/api/adminleads/rotacion/export?${p.toString()}`;
  };

  const th = (col: SortCol, label: string, right = false) => (
    <th
      className={`px-3 py-2 font-semibold text-slate-500 whitespace-nowrap ${
        right ? "text-right" : "text-left"
      }`}
    >
      <button
        type="button"
        onClick={() =>
          setSort((s) =>
            s.col === col
              ? { col, dir: s.dir === "asc" ? "desc" : "asc" }
              : { col, dir: "desc" },
          )
        }
        className={`inline-flex items-center gap-1 hover:text-slate-900 ${
          right ? "flex-row-reverse" : ""
        }`}
      >
        {label}
        {sort.col === col &&
          (sort.dir === "asc" ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          ))}
      </button>
    </th>
  );

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-purple-100 p-2.5">
            <Gauge className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Rotación de SKUs
            </h2>
            <p className="text-sm text-slate-500">
              Qué se mueve rápido, qué está estancado y cómo se ordena cada
              categoría. Solo unidades — sin precios ni costos.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <a
            href={exportUrl("xlsx")}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-purple-600 px-3 text-sm font-semibold text-white hover:bg-purple-700"
          >
            <Download className="h-4 w-4" />
            Excel
          </a>
          <a
            href={exportUrl("csv")}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            CSV
          </a>
        </div>
      </div>

      {/* Resumen */}
      {!loading && !error && data && (
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Chip label="SKUs con movimiento" value={conteos.total} />
          <Chip
            label="Alta rotación"
            value={conteos.alta}
            clase="text-emerald-700"
            onClick={() => setEstado(estado === "alta" ? "" : "alta")}
            activo={estado === "alta"}
          />
          <Chip
            label="Rotación media"
            value={conteos.media}
            onClick={() => setEstado(estado === "media" ? "" : "media")}
            activo={estado === "media"}
          />
          <Chip
            label="Baja / estancado"
            value={conteos.baja}
            clase="text-red-700"
            onClick={() => setEstado(estado === "baja" ? "" : "baja")}
            activo={estado === "baja"}
          />
        </div>
      )}

      {/* Filtros */}
      <div className="mt-4 flex flex-wrap gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por SKU, nombre o marca…"
            className="h-9 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-100"
          />
        </div>
        <select
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          className="h-9 rounded-lg border border-slate-200 px-2 text-sm focus:border-purple-400 focus:outline-none"
        >
          <option value="">Todas las categorías</option>
          {data?.categorias.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={marca}
          onChange={(e) => setMarca(e.target.value)}
          className="h-9 rounded-lg border border-slate-200 px-2 text-sm focus:border-purple-400 focus:outline-none"
        >
          <option value="">Todas las marcas</option>
          {data?.marcas.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value as "" | Estado)}
          className="h-9 rounded-lg border border-slate-200 px-2 text-sm focus:border-purple-400 focus:outline-none"
        >
          <option value="">Cualquier estado</option>
          <option value="alta">Alta rotación</option>
          <option value="media">Rotación media</option>
          <option value="baja">Baja / estancado</option>
        </select>
      </div>

      {/* Tabla */}
      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Calculando rotación desde Odoo…
          </div>
        ) : error ? (
          <div className="py-16 text-center text-sm text-red-600">{error}</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50/60">
              <tr>
                {th("nombre", "Producto")}
                {th("marca", "Marca")}
                {th("categoria", "Categoría")}
                {th("stock", "Stock", true)}
                {th("vendidas30", "30 d", true)}
                {th("vendidas60", "60 d", true)}
                {th("coberturaDias", "Días inv.", true)}
                {th("rankingCategoria", "Rank cat.", true)}
                <th className="px-3 py-2 text-left font-semibold text-slate-500">
                  Estado
                </th>
              </tr>
            </thead>
            <tbody>
              {filtradas.slice(0, MAX_FILAS).map((f) => (
                <tr
                  key={f.sku || f.nombre}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50"
                >
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-900">{f.nombre}</div>
                    {f.sku && (
                      <div className="font-mono text-[11px] text-slate-400">
                        {f.sku}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{f.marca}</td>
                  <td className="px-3 py-2 text-slate-600">{f.categoria}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                    {f.stock.toLocaleString("es-VE")}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-900">
                    {f.vendidas30.toLocaleString("es-VE")}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                    {f.vendidas60.toLocaleString("es-VE")}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                    {f.coberturaDias === null ? (
                      <span className="text-slate-400">sin ventas</span>
                    ) : (
                      `${f.coberturaDias.toLocaleString("es-VE")} d`
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                    #{f.rankingCategoria}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      title={ESTADO_META[f.estado].ayuda}
                      className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${ESTADO_META[f.estado].clase}`}
                    >
                      {ESTADO_META[f.estado].label}
                    </span>
                  </td>
                </tr>
              ))}
              {filtradas.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    className="py-12 text-center text-sm text-slate-400"
                  >
                    Ningún SKU coincide con los filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {!loading && !error && filtradas.length > 0 && (
        <p className="mt-2 text-xs text-slate-400">
          {filtradas.length > MAX_FILAS
            ? `Mostrando los primeros ${MAX_FILAS} de ${filtradas.length}. Afiná los filtros o exportá para verlos todos.`
            : `${filtradas.length} SKU${filtradas.length === 1 ? "" : "s"}.`}
          {data?.periodo &&
            ` · Ventas desde ${data.periodo.desde} · "Días inv." = a este ritmo, el stock dura N días.`}
        </p>
      )}
    </section>
  );
}

function Chip({
  label,
  value,
  clase = "text-slate-900",
  onClick,
  activo,
}: {
  label: string;
  value: number;
  clase?: string;
  onClick?: () => void;
  activo?: boolean;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      className={`rounded-xl border px-3 py-2 text-left transition-colors ${
        activo
          ? "border-purple-300 bg-purple-50"
          : "border-slate-200 bg-white hover:border-slate-300"
      } ${onClick ? "cursor-pointer" : ""}`}
    >
      <div className={`text-xl font-bold tabular-nums ${clase}`}>
        {value.toLocaleString("es-VE")}
      </div>
      <div className="text-[11px] uppercase tracking-wide text-slate-400">
        {label}
      </div>
    </Comp>
  );
}
