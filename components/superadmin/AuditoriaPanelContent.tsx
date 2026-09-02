"use client";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment, useCallback, useEffect, useState } from "react";

type LogRow = {
  id: number;
  created_at: string;
  user_id: string | null;
  user_name: string | null;
  user_role: string | null;
  method: string;
  path: string | null;
  table_name: string | null;
  record_id: string | null;
  sql_text: string | null;
  sql_params: string | null;
  before_data: string | null;
  after_data: string | null;
  status: string;
  // "legacy" = viene de la tabla vieja audit_logs (solo reasignación de
  // leads, antes/después vienen del JSON `changes`, no de before/after_data
  // reales). "system" = viene de system_audit_log.
  source: "legacy" | "system";
};

const METODO_COLOR: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  INSERT: "default",
  UPDATE: "secondary",
  DELETE: "destructive",
  POST: "default",
  PUT: "secondary",
  PATCH: "secondary",
  REASSIGN: "outline",
};

// Solo muestra los campos que de verdad cambiaron entre antes y despues —
// un diff completo fila-por-fila sería ruido, lo que importa es qué se
// tocó.
function camposCambiados(
  antes: Record<string, any> | null,
  despues: Record<string, any> | null,
): { campo: string; antes: any; despues: any }[] {
  if (!antes && !despues) return [];
  const claves = new Set([
    ...Object.keys(antes ?? {}),
    ...Object.keys(despues ?? {}),
  ]);
  const cambios: { campo: string; antes: any; despues: any }[] = [];
  for (const campo of claves) {
    const a = antes?.[campo];
    const d = despues?.[campo];
    if (JSON.stringify(a) !== JSON.stringify(d)) {
      cambios.push({ campo, antes: a, despues: d });
    }
  }
  return cambios;
}

// audit_logs (legacy) no guarda before/after_data reales — guarda un JSON
// `changes: {lead_name, from: {...}, to: {...}}` armado a mano por el
// endpoint de reasignación de leads. Se reusa el mismo diff visual
// comparando directamente from/to.
function camposCambiadosLegacy(
  changes: Record<string, any> | null,
): { campo: string; antes: any; despues: any }[] {
  if (!changes) return [];
  const from = changes.from ?? {};
  const to = changes.to ?? {};
  const claves = new Set([...Object.keys(from), ...Object.keys(to)]);
  const cambios: { campo: string; antes: any; despues: any }[] = [];
  for (const campo of claves) {
    const a = from[campo];
    const d = to[campo];
    if (JSON.stringify(a) !== JSON.stringify(d)) {
      cambios.push({ campo, antes: a, despues: d });
    }
  }
  return cambios;
}

// Solo REASSIGN y EDIT_CUOTA (desde este cambio) traen from/to diffable.
// Las demás acciones viejas (CREATE_ACTIVITY, ASSIGN_TASK), y las filas
// EDIT_CUOTA de antes de este cambio, guardan un `changes` plano sin esa
// forma — se muestra tal cual en vez de forzarlo por el diff (que siempre
// daría "sin cambios").
function detalleLegacyPlano(changes: Record<string, any> | null): { campo: string; valor: any }[] {
  if (!changes) return [];
  return Object.entries(changes)
    .filter(([campo]) => !["from", "to", "lead_name", "seller_name", "actualizados"].includes(campo))
    .map(([campo, valor]) => ({ campo, valor }));
}

// UPDATE_MASSIVE_MOQ_COST guarda `changes: {actualizados: [{sku,
// moq_anterior, moq_nuevo, costo_anterior, costo_nuevo}, ...]}` — una
// edición masiva, un SKU por fila, no un solo objeto from/to. Se arma un
// diff por SKU en vez de forzarlo por camposCambiadosLegacy.
function filasMoq(
  changes: Record<string, any> | null,
): { sku: string; cambios: { campo: string; antes: any; despues: any }[] }[] | null {
  if (!changes || !Array.isArray(changes.actualizados)) return null;
  return changes.actualizados.map((item: any) => {
    const cambios: { campo: string; antes: any; despues: any }[] = [];
    if (JSON.stringify(item.moq_anterior) !== JSON.stringify(item.moq_nuevo)) {
      cambios.push({ campo: "cantidad", antes: item.moq_anterior, despues: item.moq_nuevo });
    }
    if (JSON.stringify(item.costo_anterior) !== JSON.stringify(item.costo_nuevo)) {
      cambios.push({ campo: "costo", antes: item.costo_anterior, despues: item.costo_nuevo });
    }
    return { sku: item.sku, cambios };
  });
}

function formatearValor(valor: any): string {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "object") return JSON.stringify(valor);
  return String(valor);
}

// Una fila "campo: antes -> despues" — la usa tanto el diff de nivel
// registro como el diff por SKU de UPDATE_MASSIVE_MOQ_COST.
function FilaDiff({
  campo,
  antes,
  despues,
  vacio,
}: {
  campo: string;
  antes: any;
  despues: any;
  vacio: string;
}) {
  return (
    <div className="grid grid-cols-[140px_1fr_auto_1fr] items-center gap-3 text-sm">
      <span className="font-mono text-xs text-zinc-500">{campo}</span>
      <span className="rounded-md bg-red-50 px-2 py-1 font-mono text-xs text-red-700 truncate">
        {antes === null || antes === undefined ? vacio : String(antes)}
      </span>
      <ChevronRight className="h-3.5 w-3.5 text-zinc-300" />
      <span className="rounded-md bg-emerald-50 px-2 py-1 font-mono text-xs text-emerald-700 truncate">
        {despues === null || despues === undefined ? vacio : String(despues)}
      </span>
    </div>
  );
}

function parseJson(raw: string | null): Record<string, any> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Contenido compartido por app/[locale]/superadmin/auditoria_panel y
// app/[locale]/gerente_operaciones/auditoria_panel — mismo endpoint
// (/api/superadmin/auditoria_panel), misma UI, para no duplicar ~250
// líneas entre ambas carpetas de rol.
export default function AuditoriaPanelContent() {
  const t = useTranslations("superadmin.auditoria_panel");

  const [logs, setLogs] = useState<LogRow[]>([]);
  const [tablas, setTablas] = useState<string[]>([]);
  const [metodos, setMetodos] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [expandido, setExpandido] = useState<number | null>(null);

  const [search, setSearch] = useState("");
  const [tabla, setTabla] = useState("");
  const [metodo, setMetodo] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "25" });
      if (search) params.set("search", search);
      if (tabla) params.set("table", tabla);
      if (metodo) params.set("method", metodo);

      const res = await fetch(`/api/superadmin/auditoria_panel?${params}`);
      const data = await res.json();
      if (data.success) {
        setLogs(data.logs);
        setTotal(data.total);
        setTotalPages(data.totalPages);
        setTablas(data.tables);
        setMetodos(data.methods ?? []);
      }
    } catch {
      // se deja la tabla como estaba; no hay nada mas que hacer sin conexion
    } finally {
      setCargando(false);
    }
  }, [page, search, tabla, metodo]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Cualquier cambio de filtro vuelve a la pagina 1
  useEffect(() => {
    setPage(1);
  }, [search, tabla, metodo]);

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("title")}</h1>
        <p className="text-sm text-zinc-500 mt-1">{t("subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-white p-4 rounded-2xl border border-zinc-100 shadow-sm">
        <Input
          placeholder={t("buscar_placeholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={tabla || "all"} onValueChange={(v) => setTabla(v === "all" ? "" : v)}>
          <SelectTrigger>
            <SelectValue placeholder={t("tabla_placeholder")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("todas_las_tablas")}</SelectItem>
            {tablas.map((tb) => (
              <SelectItem key={tb} value={tb}>
                {tb}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={metodo || "all"} onValueChange={(v) => setMetodo(v === "all" ? "" : v)}>
          <SelectTrigger>
            <SelectValue placeholder={t("metodo_placeholder")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("todos_los_metodos")}</SelectItem>
            {metodos.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="bg-white rounded-3xl border border-zinc-100 shadow-sm overflow-hidden">
        {cargando ? (
          <div className="flex items-center justify-center gap-2 py-16 text-zinc-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm font-medium">{t("cargando")}</span>
          </div>
        ) : logs.length === 0 ? (
          <p className="text-center text-sm text-zinc-400 py-16">{t("sin_resultados")}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>{t("usuario")}</TableHead>
                  <TableHead>{t("metodo")}</TableHead>
                  <TableHead>{t("tabla")}</TableHead>
                  <TableHead>{t("registro")}</TableHead>
                  <TableHead className="text-right">{t("fecha")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => {
                  const esLegacy = log.source === "legacy";
                  const legacyChanges = esLegacy ? parseJson(log.sql_params) : null;
                  const antes = esLegacy ? null : parseJson(log.before_data);
                  const despues = esLegacy ? null : parseJson(log.after_data);
                  const cambios = esLegacy
                    ? camposCambiadosLegacy(legacyChanges)
                    : camposCambiados(antes, despues);
                  const detallePlano = esLegacy ? detalleLegacyPlano(legacyChanges) : [];
                  const filasMoqDeEsteLog = esLegacy ? filasMoq(legacyChanges) : null;
                  const hayDatos = esLegacy ? legacyChanges != null : antes || despues;
                  const abierto = expandido === log.id;

                  return (
                    <Fragment key={log.id}>
                      <TableRow
                        className="cursor-pointer hover:bg-zinc-50/50"
                        onClick={() => setExpandido(abierto ? null : log.id)}
                      >
                        <TableCell>
                          {abierto ? (
                            <ChevronUp className="h-4 w-4 text-zinc-400" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-zinc-400" />
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="font-semibold text-zinc-900">
                            {log.user_name || t("usuario_desconocido")}
                          </div>
                          {log.user_role && (
                            <div className="text-xs text-zinc-400 uppercase">{log.user_role}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={METODO_COLOR[log.method] ?? "outline"}>
                            {log.method}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {log.table_name || "—"}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {log.record_id || "—"}
                        </TableCell>
                        <TableCell className="text-right text-xs text-zinc-400">
                          {new Date(log.created_at).toLocaleString()}
                        </TableCell>
                      </TableRow>
                      {abierto && (
                        <TableRow key={`${log.id}-detalle`}>
                          <TableCell colSpan={6} className="bg-zinc-50/70 p-5">
                            {esLegacy && legacyChanges?.lead_name && (
                              <p className="mb-3 text-xs text-zinc-500">
                                {t("contexto_lead", { lead: legacyChanges.lead_name })}
                              </p>
                            )}
                            {esLegacy && !legacyChanges?.lead_name && legacyChanges?.seller_name && (
                              <p className="mb-3 text-xs text-zinc-500">
                                {t("contexto_vendedor", { vendedor: legacyChanges.seller_name })}
                              </p>
                            )}
                            {filasMoqDeEsteLog ? (
                              <div className="space-y-4">
                                <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                                  {t("campos_cambiados")}
                                </p>
                                {filasMoqDeEsteLog.map((fila, i) => (
                                  <div key={`${fila.sku}-${i}`} className="space-y-1">
                                    <p className="font-mono text-xs font-semibold text-zinc-600">
                                      {fila.sku}
                                    </p>
                                    <div className="grid gap-2 pl-2">
                                      {fila.cambios.length > 0 ? (
                                        fila.cambios.map((c) => (
                                          <FilaDiff
                                            key={c.campo}
                                            campo={c.campo}
                                            antes={c.antes}
                                            despues={c.despues}
                                            vacio={t("vacio")}
                                          />
                                        ))
                                      ) : (
                                        <p className="text-xs text-zinc-400">{t("sin_cambios")}</p>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : cambios.length > 0 ? (
                              <div className="space-y-2">
                                <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                                  {t("campos_cambiados")}
                                </p>
                                <div className="grid gap-2">
                                  {cambios.map((c) => (
                                    <FilaDiff
                                      key={c.campo}
                                      campo={c.campo}
                                      antes={c.antes}
                                      despues={c.despues}
                                      vacio={t("vacio")}
                                    />
                                  ))}
                                </div>
                              </div>
                            ) : detallePlano.length > 0 ? (
                              <div className="space-y-2">
                                <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                                  {t("detalle")}
                                </p>
                                <div className="grid gap-1">
                                  {detallePlano.map((d) => (
                                    <div key={d.campo} className="grid grid-cols-[140px_1fr] gap-3 text-sm">
                                      <span className="font-mono text-xs text-zinc-500">{d.campo}</span>
                                      <span className="font-mono text-xs text-zinc-700 truncate">
                                        {formatearValor(d.valor) || t("vacio")}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <p className="text-sm text-zinc-400">
                                {hayDatos ? t("sin_cambios") : t("sin_diff")}
                              </p>
                            )}
                            <details className="mt-4">
                              <summary className="cursor-pointer text-xs font-semibold text-zinc-400 hover:text-zinc-600">
                                {t("ver_sql_crudo")}
                              </summary>
                              <pre className="mt-2 overflow-x-auto rounded-lg bg-zinc-900 p-3 text-[11px] text-zinc-100">
                                {log.sql_text?.trim() || (esLegacy ? t("origen_legacy") : "")}
                                {"\n"}
                                {log.sql_params}
                              </pre>
                            </details>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-zinc-400">
            {t("total_registros", { total })}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs font-semibold text-zinc-600">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
