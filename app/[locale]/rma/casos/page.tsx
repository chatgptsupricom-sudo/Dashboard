"use client";

import { AlertaIngresosPendientes } from "@/components/rma/AlertaIngresosPendientes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, Plus, Search, Trash2, Wrench } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

const statusColors: Record<string, string> = {
  recibido: "bg-blue-100 text-blue-700 border-blue-200",
  reparado: "bg-green-100 text-green-700 border-green-200",
  nota_credito: "bg-purple-100 text-purple-700 border-purple-200",
  no_procesado: "bg-red-100 text-red-700 border-red-200",
  reingresado: "bg-teal-100 text-teal-700 border-teal-200",
};

const statusLabels: Record<string, string> = {
  recibido: "Recibido",
  reparado: "Reparado",
  nota_credito: "Nota de Crédito",
  no_procesado: "No Procesado",
  reingresado: "Reingresado",
};

export default function RmaCasosPage() {
  const t = useTranslations("rma");
  const params = useParams();
  const router = useRouter();
  const locale = (params?.locale as string) || "es";

  const [cases, setCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [origenFilter, setOrigenFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchCases();
  }, [page, statusFilter, origenFilter]);

  const fetchCases = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: String(page),
        limit: "20",
      });
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      if (origenFilter) params.set("origen", origenFilter);

      const res = await fetch(`/api/rma?${params}`);
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

  return (
    <div className="p-4 sm:p-8 space-y-6 bg-slate-50/30 min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push(`/${locale}/rma`)}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-100 rounded-xl">
              <Wrench className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{t("cases_list")}</h1>
              <p className="text-sm text-slate-500">{t("cases_list_desc", { total })}</p>
            </div>
          </div>
        </div>
        <Link href={`/${locale}/rma/nuevo`}>
          <Button className="bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="w-4 h-4 mr-2" />
            {t("new_case")}
          </Button>
        </Link>
      </div>

      <AlertaIngresosPendientes />

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
                <SelectItem value="recibido">{statusLabels.recibido}</SelectItem>
                <SelectItem value="reparado">{statusLabels.reparado}</SelectItem>
                <SelectItem value="nota_credito">{statusLabels.nota_credito}</SelectItem>
                <SelectItem value="no_procesado">{statusLabels.no_procesado}</SelectItem>
                <SelectItem value="reingresado">{statusLabels.reingresado}</SelectItem>
              </SelectContent>
            </Select>
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
              <Wrench className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>{t("no_cases")}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-slate-500 bg-slate-50">
                    <th className="p-4 font-medium">{t("case_number")}</th>
                    <th className="p-4 font-medium">{t("client")}</th>
                    <th className="p-4 font-medium">{t("model")}</th>
                    <th className="p-4 font-medium">{t("serial")}</th>
                    <th className="p-4 font-medium">{t("status_label")}</th>
                    <th className="p-4 font-medium">{t("date")}</th>
                    <th className="p-4 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {cases.map((c) => (
                    <tr key={c.id} className="border-b last:border-0 hover:bg-slate-50 cursor-pointer" onClick={() => router.push(`/${locale}/rma/casos/${c.id}`)}>
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
                      <td className="p-4 text-slate-700">{c.model || c.product_code || "—"}</td>
                      <td className="p-4 text-slate-500 font-mono text-xs">{c.serial_quantity || "—"}</td>
                      <td className="p-4">
                        <Badge className={`${statusColors[c.status]} border text-[11px]`}>
                          {statusLabels[c.status]}
                        </Badge>
                      </td>
                      <td className="p-4 text-slate-500">
                        {new Date(c.created_at).toLocaleDateString("es-VE")}
                      </td>
                      <td className="p-4">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                          onClick={(e) => { e.stopPropagation(); setDeleteId(c.id); }}
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
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
            >
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
