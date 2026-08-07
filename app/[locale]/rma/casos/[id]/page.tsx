"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Loader2,
  Save,
  User,
  Wrench,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

const statusColors: Record<string, string> = {
  recibido: "bg-blue-100 text-blue-700 border-blue-200",
  en_reparacion: "bg-amber-100 text-amber-700 border-amber-200",
  reparado: "bg-green-100 text-green-700 border-green-200",
};

const statusLabels: Record<string, string> = {
  recibido: "Recibido",
  en_reparacion: "En Reparación",
  reparado: "Reparado",
};

const nextStatusMap: Record<string, string[]> = {
  recibido: ["en_reparacion"],
  en_reparacion: ["reparado"],
  reparado: [],
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

  useEffect(() => {
    if (caseId) fetchCase();
  }, [caseId]);

  const fetchCase = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/rma/${caseId}`);
      const data = await res.json();
      if (data.success) {
        setCaseData(data.case);
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

  const handleSaveEdit = async () => {
    try {
      setSaving(true);
      const res = await fetch(`/api/rma/${caseId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name: editForm.client_name,
          client_phone: editForm.client_phone,
          product_name: editForm.product_name,
          product_serial: editForm.product_serial,
          product_model: editForm.product_model,
          reported_fault: editForm.reported_fault,
          diagnosis: editForm.diagnosis,
          notes: editForm.notes,
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

  const allowedNext = nextStatusMap[caseData.status] || [];

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
              <h1 className="text-2xl font-bold text-slate-900">{caseData.case_number}</h1>
              <p className="text-sm text-slate-500">{caseData.client_name} — {caseData.product_name}</p>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {allowedNext.length > 0 && (
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
                    <Label>{t("new_status")}</Label>
                    <div className="flex gap-2 mt-2">
                      {allowedNext.map((s) => (
                        <Button
                          key={s}
                          variant={newStatus === s ? "default" : "outline"}
                          size="sm"
                          onClick={() => setNewStatus(s)}
                          className={newStatus === s ? "bg-blue-600 text-white" : ""}
                        >
                          {statusLabels[s]}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label>{t("change_notes")}</Label>
                    <Textarea
                      value={changeNotes}
                      onChange={(e) => setChangeNotes(e.target.value)}
                      placeholder={t("change_notes_placeholder")}
                      rows={3}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setStatusDialogOpen(false)}>
                    {t("cancel")}
                  </Button>
                  <Button onClick={handleStatusChange} disabled={!newStatus || saving}>
                    {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    {t("confirm")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          <Button variant="outline" onClick={() => setEditing(!editing)}>
            {editing ? t("cancel") : t("edit")}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Case Info */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="rounded-3xl border-none shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg font-semibold text-slate-900">{t("case_info")}</CardTitle>
              <Badge className={`${statusColors[caseData.status]} border text-[11px]`}>
                {statusLabels[caseData.status]}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-4">
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
                  <Label className="text-xs font-medium text-slate-400 uppercase">{t("client_phone")}</Label>
                  {editing ? (
                    <Input value={editForm.client_phone || ""} onChange={(e) => setEditForm({ ...editForm, client_phone: e.target.value })} />
                  ) : (
                    <p className="text-sm text-slate-700 mt-1">{caseData.client_phone || "—"}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-none shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-slate-900">{t("product_info")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <Label className="text-xs font-medium text-slate-400 uppercase">{t("product_name")}</Label>
                  {editing ? (
                    <Input value={editForm.product_name} onChange={(e) => setEditForm({ ...editForm, product_name: e.target.value })} />
                  ) : (
                    <p className="text-sm text-slate-700 mt-1">{caseData.product_name}</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs font-medium text-slate-400 uppercase">{t("product_model")}</Label>
                  {editing ? (
                    <Input value={editForm.product_model || ""} onChange={(e) => setEditForm({ ...editForm, product_model: e.target.value })} />
                  ) : (
                    <p className="text-sm text-slate-700 mt-1">{caseData.product_model || "—"}</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs font-medium text-slate-400 uppercase">{t("product_serial")}</Label>
                  {editing ? (
                    <Input value={editForm.product_serial || ""} onChange={(e) => setEditForm({ ...editForm, product_serial: e.target.value })} />
                  ) : (
                    <p className="text-sm text-slate-700 mt-1 font-mono">{caseData.product_serial || "—"}</p>
                  )}
                </div>
              </div>
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
              <div>
                <Label className="text-xs font-medium text-slate-400 uppercase">{t("notes")}</Label>
                {editing ? (
                  <Textarea value={editForm.notes || ""} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} rows={3} />
                ) : (
                  <p className="text-sm text-slate-700 mt-1">{caseData.notes || "—"}</p>
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
        </div>

        {/* Timeline */}
        <div className="space-y-6">
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
                            {h.from_status ? `${statusLabels[h.from_status]} → ${statusLabels[h.to_status]}` : statusLabels[h.to_status]}
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
