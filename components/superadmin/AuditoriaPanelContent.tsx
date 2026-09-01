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
};

const METODO_COLOR: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  INSERT: "default",
  UPDATE: "secondary",
  DELETE: "destructive",
  POST: "default",
  PUT: "secondary",
  PATCH: "secondary",
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
            <SelectItem value="INSERT">INSERT</SelectItem>
            <SelectItem value="UPDATE">UPDATE</SelectItem>
            <SelectItem value="DELETE">DELETE</SelectItem>
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
                  const antes = parseJson(log.before_data);
                  const despues = parseJson(log.after_data);
                  const cambios = camposCambiados(antes, despues);
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
                            {cambios.length > 0 ? (
                              <div className="space-y-2">
                                <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                                  {t("campos_cambiados")}
                                </p>
                                <div className="grid gap-2">
                                  {cambios.map((c) => (
                                    <div
                                      key={c.campo}
                                      className="grid grid-cols-[140px_1fr_auto_1fr] items-center gap-3 text-sm"
                                    >
                                      <span className="font-mono text-xs text-zinc-500">
                                        {c.campo}
                                      </span>
                                      <span className="rounded-md bg-red-50 px-2 py-1 font-mono text-xs text-red-700 truncate">
                                        {c.antes === null || c.antes === undefined
                                          ? t("vacio")
                                          : String(c.antes)}
                                      </span>
                                      <ChevronRight className="h-3.5 w-3.5 text-zinc-300" />
                                      <span className="rounded-md bg-emerald-50 px-2 py-1 font-mono text-xs text-emerald-700 truncate">
                                        {c.despues === null || c.despues === undefined
                                          ? t("vacio")
                                          : String(c.despues)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <p className="text-sm text-zinc-400">
                                {antes || despues ? t("sin_cambios") : t("sin_diff")}
                              </p>
                            )}
                            <details className="mt-4">
                              <summary className="cursor-pointer text-xs font-semibold text-zinc-400 hover:text-zinc-600">
                                {t("ver_sql_crudo")}
                              </summary>
                              <pre className="mt-2 overflow-x-auto rounded-lg bg-zinc-900 p-3 text-[11px] text-zinc-100">
                                {log.sql_text?.trim()}
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
