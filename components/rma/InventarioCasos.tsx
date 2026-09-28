"use client";

import { AlertaIngresosPendientes } from "@/components/rma/AlertaIngresosPendientes";
import { colorEstado, ESTADOS_RMA, etiquetaEstado } from "@/components/rma/estados";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, Globe, Loader2, PackageCheck, Plus, Search, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

export type Procedencia = "supricom" | "externo";

/** Filtros que llegan desde las tarjetas del Dashboard (?grupo=, ?mes=1). */
const GRUPOS: Record<string, string> = {
  pendientes: "Pendientes",
  completados_mes: "Completados este mes",
};

/**
 * Inventario de casos de RMA de una procedencia: los equipos que vendió
 * Supricom, o los que no (portal de equipos externos). Cada uno es su propia
 * sección del sidebar (/rma/inventario/supricom y /rma/inventario/externo).
 */
export function InventarioCasos({ procedencia }: { procedencia: Procedencia }) {
  const t = useTranslations("rma");
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = (params?.locale as string) || "es";
  const esExterno = procedencia === "externo";

  const [cases, setCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(() => {
    const s = searchParams?.get("status") || "";
    return (ESTADOS_RMA as readonly string[]).includes(s) ? s : "";
  });
  const [grupo, setGrupo] = useState(() => {
    const g = searchParams?.get("grupo") || "";
    return GRUPOS[g] ? g : "";
  });
  const [soloMes, setSoloMes] = useState(searchParams?.get("mes") === "1");
  const [origenFilter, setOrigenFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchCases();
  }, [page, statusFilter, origenFilter, grupo, soloMes]);

  const fetchCases = async () => {
    try {
      setLoading(true);
      const q = new URLSearchParams({ page: String(page), limit: "20", procedencia });
      if (search) q.set("search", search);
      if (statusFilter) q.set("status", statusFilter);
      if (origenFilter) q.set("origen", origenFilter);
      if (grupo) q.set("grupo", grupo);
      if (soloMes) q.set("mes", "1");

      const res = await fetch(`/api/rma?${q}`);
      const data = await res.json();
      if (data.success) {
        setCases(data.cases);
        setTotalPages(data.totalPages);
        setTotal(data.total);
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const quitarFiltroTablero = () => {
    setGrupo("");
    setSoloMes(false);
    setPage(1);
    router.replace(`/${locale}/rma/inventario/${procedencia}`, { scroll: false });
  };

  const handleSearch = () => {
    setPage(1);
    fetchCases();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      setDeleting(true);
      const res = await fetch(`/api/rma/${deleteId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setDeleteId(null);
        fetchCases();
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setDeleting(false);
    }
  };

  const filtroTablero = [grupo ? GRUPOS[grupo] : "", soloMes ? "entraron este mes" : ""].filter(Boolean).join(" · ");

  return (
    <div className="p-4 sm:p-8 space-y-6 bg-slate-50/30 min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className={`p-3 rounded-xl ${esExterno ? "bg-amber-100" : "bg-blue-100"}`}>
            {esExterno ? (
              <Globe className="w-6 h-6 text-amber-700" />
            ) : (
              <PackageCheck className="w-6 h-6 text-blue-600" />
            )}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {t(esExterno ? "inventario_externo" : "inventario_supricom")}
            </h1>
            <p className="text-sm text-slate-500">
              {t(esExterno ? "inventario_externo_desc" : "inventario_supricom_desc", { total })}
            </p>
          </div>
        </div>
        {/* Los externos entran solo por el portal (/servicio-tecnico/<sucursal>/externo). */}
        {!esExterno && (
          <Link href={`/${locale}/rma/nuevo`}>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white">
              <Plus className="w-4 h-4 mr-2" />
              {t("new_case")}
            </Button>
          </Link>
        )}
      </div>

      <AlertaIngresosPendientes />

      {filtroTablero && (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-sm text-blue-700 ring-1 ring-blue-200">
            {filtroTablero}
            <button type="button" onClick={quitarFiltroTablero} aria-label={t("quitar_filtro")}>
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        </div>
      )}

      {/* Filters */}
      <Card className="rounded-3xl border-none shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder={t("search_placeholder")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder={t("all_statuses")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("all_statuses")}</SelectItem>
                {ESTADOS_RMA.filter((e) => !(esExterno && (e === "nota_credito" || e === "nc_revision"))).map((e) => (
                  <SelectItem key={e} value={e}>{etiquetaEstado[e]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!esExterno && (
              <Select value={origenFilter} onValueChange={(v) => { setOrigenFilter(v === "all" ? "" : v); setPage(1); }}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder={t("all_origen")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("all_origen")}</SelectItem>
                  <SelectItem value="interno">{t("origen_interno")}</SelectItem>
                  <SelectItem value="portal">{t("origen_portal")}</SelectItem>
                </SelectContent>
              </Select>
            )}
            <Button variant="outline" onClick={handleSearch}>
              <Search className="w-4 h-4 mr-2" />
              {t("search")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="rounded-3xl border-none shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
            </div>
          ) : cases.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <PackageCheck className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>{t("no_cases")}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-slate-500 bg-slate-50">
                    <th className="p-4 font-medium">{t("case_number")}</th>
                    <th className="p-4 font-medium">{t("client")}</th>
                    <th className="p-4 font-medium">{esExterno ? t("externo_documento") : t("invoice_number")}</th>
                    <th className="p-4 font-medium">{t("model")}</th>
                    <th className="p-4 font-medium">{t("serial")}</th>
                    <th className="p-4 font-medium">{t("status_label")}</th>
                    <th className="p-4 font-medium">{t("date")}</th>
                    <th className="p-4 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {cases.map((c) => (
                    <tr
                      key={c.id}
                      className="border-b last:border-0 hover:bg-slate-50 cursor-pointer"
                      onClick={() => router.push(`/${locale}/rma/casos/${c.id}`)}
                    >
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <span className="text-blue-600 font-medium">{c.case_number}</span>
                          {c.origen === "portal" && (
                            <Badge className="bg-violet-100 text-violet-700 border-violet-200 border text-[11px]">
                              {t("badge_portal")}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="p-4 text-slate-700">{c.client_name}</td>
                      <td className="p-4 text-slate-500 font-mono text-xs">
                        {(esExterno ? c.client_document : c.invoice_number) || "—"}
                      </td>
                      <td className="p-4 text-slate-700">
                        {c.model || c.product_code || "—"}
                        {/* Envío con varios productos (issue #331) */}
                        {Number(c.productos_count) > 1 && (
                          <Badge className="ml-2 bg-slate-100 text-slate-600 border-slate-200 border text-[11px]">
                            +{Number(c.productos_count) - 1}
                          </Badge>
                        )}
                      </td>
                      <td className="p-4 text-slate-500 font-mono text-xs">{c.serial_quantity || "—"}</td>
                      <td className="p-4">
                        <Badge className={`${colorEstado[c.status] || ""} border text-[11px]`}>
                          {etiquetaEstado[c.status] || c.status}
                        </Badge>
                      </td>
                      <td className="p-4 text-slate-500">{new Date(c.created_at).toLocaleDateString("es-VE")}</td>
                      <td className="p-4">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteId(c.id);
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">
            {t("page")} {page} {t("of")} {totalPages}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteId !== null} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("delete_case")}</DialogTitle>
            <DialogDescription>{t("delete_confirm")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>{t("cancel")}</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
