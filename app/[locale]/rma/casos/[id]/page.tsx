"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  Copy,
  Loader2,
  Printer,
  Save,
  Trash2,
  User,
  Wrench,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

const statusColors: Record<string, string> = {
  recibido: "bg-blue-100 text-blue-700 border-blue-200",
  reparado: "bg-green-100 text-green-700 border-green-200",
  nota_credito: "bg-purple-100 text-purple-700 border-purple-200",
  no_procesado: "bg-red-100 text-red-700 border-red-200",
  reingresado: "bg-cyan-100 text-cyan-700 border-cyan-200",
};

const statusLabels: Record<string, string> = {
  recibido: "Recibido",
  reparado: "Reparado",
  nota_credito: "Nota de Crédito",
  no_procesado: "No Procesado",
  reingresado: "Reingresado",
};

export default function RmaCasoDetailPage() {
  const t = useTranslations("rma");
  const params = useParams();
  const router = useRouter();
  const locale = (params?.locale as string) || "es";
  const caseId = params?.id as string;

  const [caseData, setCaseData] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [newStatus, setNewStatus] = useState("");
  const [changeNotes, setChangeNotes] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (caseId) fetchCase();
  }, [caseId]);

  const fetchCase = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/rma/${caseId}`);
      const data = await res.json();
      if (data.success) {
        // La API devuelve `adjuntos` al lado del caso, no dentro, pero toda
        // esta pantalla los lee como `caseData.adjuntos`. Sin unirlos aquí,
        // siempre valían undefined y el caso decía "sin adjuntos" aunque el
        // cliente sí hubiera subido fotos.
        setCaseData({ ...data.case, adjuntos: data.adjuntos ?? [] });
        setHistory(data.history);
        setEditForm(data.case);
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async () => {
    if (!newStatus) return;

    // If nota_credito, change status and redirect to nota-credito form
    if (newStatus === "nota_credito") {
      try {
        setSaving(true);
        const res = await fetch(`/api/rma/${caseId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: newStatus,
            changed_by: "Usuario Actual",
            change_notes: changeNotes,
          }),
        });
        const data = await res.json();
        if (data.success) {
          setStatusDialogOpen(false);
          setNewStatus("");
          setChangeNotes("");
          router.push(`/${locale}/rma/nota-credito?case=${caseData.case_number}`);
        }
      } catch (error) {
        console.error("Error:", error);
      } finally {
        setSaving(false);
      }
      return;
    }

    try {
      setSaving(true);
      const res = await fetch(`/api/rma/${caseId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: newStatus,
          changed_by: "Usuario Actual",
          change_notes: changeNotes,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setStatusDialogOpen(false);
        setNewStatus("");
        setChangeNotes("");
        fetchCase();
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      setDeleting(true);
      const res = await fetch(`/api/rma/${caseId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        router.push(`/${locale}/rma/casos`);
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setDeleting(false);
    }
  };

  const handleSaveEdit = async () => {
    try {
      setSaving(true);
      const res = await fetch(`/api/rma/${caseId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_code: editForm.product_code,
          hardware: editForm.hardware,
          brand: editForm.brand,
          model: editForm.model,
          invoice_number: editForm.invoice_number,
          client_name: editForm.client_name,
          client_phone: editForm.client_phone,
          serial_quantity: editForm.serial_quantity,
          reported_fault: editForm.reported_fault,
          diagnosis: editForm.diagnosis,
          status: editForm.status,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setEditing(false);
        fetchCase();
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!caseData) {
    return (
      <div className="p-8 text-center text-slate-500">
        <p>{t("case_not_found")}</p>
        <Button variant="outline" onClick={() => router.push(`/${locale}/rma/casos`)} className="mt-4">
          {t("back_to_list")}
        </Button>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 space-y-6 bg-slate-50/30 min-h-screen max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push(`/${locale}/rma/casos`)}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-100 rounded-xl">
              <Wrench className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-slate-900">RMA N.º {caseData.case_number}</h1>
                {caseData.origen === "portal" && (
                  <Badge className="bg-violet-100 text-violet-700 border-violet-200 text-[11px]">
                    {t("badge_portal")}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-slate-500">{caseData.client_name} — {caseData.model || caseData.hardware || ""}</p>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                <CheckCircle2 className="w-4 h-4 mr-2" />
                {t("change_status")}
              </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("change_status")}</DialogTitle>
                  <DialogDescription>{t("change_status_desc")}</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div>
                    <Label className="mb-2 block">{t("new_status")}</Label>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(statusLabels).filter(([key]) => key !== caseData.status).map(([key, label]) => (
                        <Button
                          key={key}
                          variant={newStatus === key ? "default" : "outline"}
                          onClick={() => setNewStatus(key)}
                          className={`px-4 py-2 ${newStatus === key ? "bg-blue-600 text-white" : ""}`}
                        >
                          {label}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label className="mb-2 block">{t("change_notes")}</Label>
                    <Textarea
                      value={changeNotes}
                      onChange={(e) => setChangeNotes(e.target.value)}
                      placeholder={t("change_notes_placeholder")}
                      rows={3}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setStatusDialogOpen(false)}>{t("cancel")}</Button>
                  <Button onClick={handleStatusChange} disabled={!newStatus || saving}>
                    {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    {t("confirm")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          {caseData.status === "nota_credito" && (
            <Button variant="outline" onClick={() => router.push(`/${locale}/rma/nota-credito?case=${caseData.case_number}`)}>
              <Printer className="w-4 h-4 mr-2" />
              {t("print_pdf")}
            </Button>
          )}
          <Button variant="outline" onClick={() => setEditing(!editing)}>
            {editing ? t("cancel") : t("edit")}
          </Button>
          <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50">
                <Trash2 className="w-4 h-4 mr-2" />
                {t("delete")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("delete_case")}</DialogTitle>
                <DialogDescription>{t("delete_confirm")}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>{t("cancel")}</Button>
                <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                  {deleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {t("delete")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Info principal */}
        <div className="lg:col-span-2 space-y-6">
          {/* Producto */}
          <Card className="rounded-3xl border-none shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg font-semibold text-slate-900">{t("product_info")}</CardTitle>
              <Badge className={`${statusColors[caseData.status]} border text-[11px]`}>
                {statusLabels[caseData.status]}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { key: "product_code", label: t("product_code") },
                  { key: "hardware", label: t("hardware") },
                  { key: "brand", label: t("brand") },
                  { key: "model", label: t("model") },
                  { key: "invoice_number", label: t("invoice_number") },
                  { key: "serial_quantity", label: t("serial_quantity") },
                ].map(({ key, label }) => (
                  <div key={key}>
                    <Label className="text-xs font-medium text-slate-400 uppercase">{label}</Label>
                    {editing ? (
                      <Input value={editForm[key] || ""} onChange={(e) => setEditForm({ ...editForm, [key]: e.target.value })} />
                    ) : (
                      <p className="text-sm text-slate-700 mt-1">{caseData[key] || "—"}</p>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Cliente */}
          <Card className="rounded-3xl border-none shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-slate-900">{t("client_info")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs font-medium text-slate-400 uppercase">{t("client_name")}</Label>
                  {editing ? (
                    <Input value={editForm.client_name} onChange={(e) => setEditForm({ ...editForm, client_name: e.target.value })} />
                  ) : (
                    <p className="text-sm text-slate-700 mt-1">{caseData.client_name}</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs font-medium text-slate-400 uppercase">Teléfono del cliente</Label>
                  {editing ? (
                    <Input value={editForm.client_phone || ""} onChange={(e) => setEditForm({ ...editForm, client_phone: e.target.value })} />
                  ) : (
                    <p className="text-sm text-slate-700 mt-1">{caseData.client_phone || "—"}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Falla y diagnóstico */}
          <Card className="rounded-3xl border-none shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-slate-900">{t("fault_info")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-xs font-medium text-slate-400 uppercase">{t("reported_fault")}</Label>
                {editing ? (
                  <Textarea value={editForm.reported_fault} onChange={(e) => setEditForm({ ...editForm, reported_fault: e.target.value })} rows={3} />
                ) : (
                  <p className="text-sm text-slate-700 mt-1">{caseData.reported_fault}</p>
                )}
              </div>
              <div>
                <Label className="text-xs font-medium text-slate-400 uppercase">{t("diagnosis")}</Label>
                {editing ? (
                  <Textarea value={editForm.diagnosis || ""} onChange={(e) => setEditForm({ ...editForm, diagnosis: e.target.value })} rows={3} />
                ) : (
                  <p className="text-sm text-slate-700 mt-1">{caseData.diagnosis || "—"}</p>
                )}
              </div>
              {editing && (
                <div className="flex justify-end">
                  <Button onClick={handleSaveEdit} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white">
                    {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                    {t("save_changes")}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Adjuntos */}
          <Card className="rounded-3xl border-none shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg font-semibold text-slate-900">{t("adjuntos")}</CardTitle>
              <span className="text-xs text-slate-400">{t("adjuntos_count", { count: caseData.adjuntos?.length || 0 })}</span>
            </CardHeader>
            <CardContent>
              {caseData.adjuntos && caseData.adjuntos.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {caseData.adjuntos.map((adj: any, idx: number) => (
                    <div key={idx} className="space-y-1">
                      {adj.mime?.startsWith("video/") ? (
                        <video src={adj.url} controls className="w-full max-h-48 object-cover rounded-lg border border-slate-200" />
                      ) : (
                        <img src={adj.url} alt={adj.filename} className="w-full max-h-48 object-cover rounded-lg border border-slate-200" />
                      )}
                      <p className="text-xs text-slate-500 truncate">{adj.filename}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400 text-center py-4">{t("sin_adjuntos")}</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Timeline */}
        <div className="space-y-6">
          {caseData.origen === "portal" && (
            <Card className="rounded-3xl border-none shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-slate-900">{t("portal_data")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs font-medium text-slate-400 uppercase">{t("portal_source")}</Label>
                  <div className="mt-1">
                    <Badge className="bg-violet-100 text-violet-700 border-violet-200 text-[11px]">
                      {t("badge_portal")}
                    </Badge>
                  </div>
                </div>
                <div>
                  <Label className="text-xs font-medium text-slate-400 uppercase">{t("portal_serial")}</Label>
                  <p className="text-sm text-slate-700 mt-1 font-mono">{caseData.serial || "—"}</p>
                </div>
                <div>
                  <Label className="text-xs font-medium text-slate-400 uppercase">{t("portal_contact_phone")}</Label>
                  <p className="text-sm text-slate-700 mt-1">{caseData.client_phone || "—"}</p>
                </div>
                {/* Garantía CONGELADA del momento del reporte, no recalculada
                    al abrir esta pantalla. Si el técnico ve un número distinto
                    al que vio el cliente, no hay conversación posible. */}
                <div>
                  <Label className="text-xs font-medium text-slate-400 uppercase">{t("portal_warranty")}</Label>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge
                      className={
                        caseData.garantia_estado === "en_garantia"
                          ? "bg-emerald-100 text-emerald-700 border-emerald-200 text-[11px]"
                          : caseData.garantia_estado === "vida_util"
                            ? "bg-violet-100 text-violet-700 border-violet-200 text-[11px]"
                            : caseData.garantia_estado === "vencida"
                              ? "bg-amber-100 text-amber-800 border-amber-200 text-[11px]"
                              : "bg-slate-100 text-slate-600 border-slate-200 text-[11px]"
                      }
                    >
                      {t(`warranty_${caseData.garantia_estado || "indeterminada"}`)}
                    </Badge>
                    {caseData.garantia_marca && (
                      <span className="text-xs text-slate-500">
                        {caseData.garantia_marca}
                        {caseData.garantia_meses ? ` · ${caseData.garantia_meses}m` : ""}
                      </span>
                    )}
                  </div>
                  {caseData.garantia_vence && (
                    <p className="mt-1 text-xs text-slate-500">
                      {t("portal_warranty_until")}{" "}
                      {String(caseData.garantia_vence).slice(0, 10)}
                    </p>
                  )}
                  {(!caseData.garantia_estado ||
                    caseData.garantia_estado === "indeterminada") && (
                    <p className="mt-1 text-xs text-amber-700">
                      {t("portal_warranty_todo")}
                    </p>
                  )}
                </div>
                <div className="pt-3 border-t border-slate-100">
                  <Label className="text-xs font-medium text-slate-400 uppercase">{t("odoo_refs")}</Label>
                  <div className="mt-2 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">{t("odoo_partner")}:</span>
                      <span className="text-sm font-mono text-slate-700">{caseData.odoo_partner_id || "—"}</span>
                      {caseData.odoo_partner_id && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => navigator.clipboard.writeText(String(caseData.odoo_partner_id))}
                        >
                          <Copy className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">{t("odoo_product")}:</span>
                      <span className="text-sm font-mono text-slate-700">{caseData.odoo_product_id || "—"}</span>
                      {caseData.odoo_product_id && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => navigator.clipboard.writeText(String(caseData.odoo_product_id))}
                        >
                          <Copy className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="rounded-3xl border-none shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-slate-900">{t("timeline")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {history.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-4">{t("no_history")}</p>
                ) : (
                  history.map((h, idx) => (
                    <div key={h.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className={`w-3 h-3 rounded-full ${idx === history.length - 1 ? "bg-blue-500" : "bg-slate-300"}`} />
                        {idx < history.length - 1 && <div className="w-0.5 flex-1 bg-slate-200 mt-1" />}
                      </div>
                      <div className="pb-4 flex-1">
                        <div className="flex items-center gap-2">
                          {h.to_status === "reparado" ? (
                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                          ) : (
                            <Clock className="w-4 h-4 text-blue-500" />
                          )}
                          <span className="text-sm font-medium text-slate-700">
                            {h.from_status ? `${statusLabels[h.from_status] || h.from_status} → ${statusLabels[h.to_status] || h.to_status}` : statusLabels[h.to_status] || h.to_status}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                          <User className="w-3 h-3" />
                          <span>{h.changed_by}</span>
                          <span>•</span>
                          <Calendar className="w-3 h-3" />
                          <span>{new Date(h.created_at).toLocaleString("es-VE")}</span>
                        </div>
                        {h.notes && (
                          <p className="text-xs text-slate-500 mt-1 bg-slate-50 rounded-lg p-2">{h.notes}</p>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-none shadow-sm">
            <CardContent className="p-4">
              <div className="text-xs text-slate-400 space-y-1">
                <p>{t("created")}: {new Date(caseData.created_at).toLocaleString("es-VE")}</p>
                <p>{t("updated")}: {new Date(caseData.updated_at).toLocaleString("es-VE")}</p>
                <p>{t("created_by")}: {caseData.created_by}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
