"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Loader2, Save, Truck } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

export default function RmaSalidaPage() {
  const t = useTranslations("rma");
  const params = useParams();
  const router = useRouter();
  const locale = (params?.locale as string) || "es";

  const [saving, setSaving] = useState(false);
  const [exits, setExits] = useState<any[]>([]);
  const [loadingExits, setLoadingExits] = useState(true);
  const [form, setForm] = useState({
    case_id: "",
    product_description: "",
    quantity: "1",
    reason: "",
    exit_date: new Date().toISOString().split("T")[0],
    authorized_by: "",
    notes: "",
  });

  useEffect(() => {
    fetchExits();
  }, []);

  const fetchExits = async () => {
    try {
      setLoadingExits(true);
      const res = await fetch("/api/rma/exit");
      const data = await res.json();
      if (data.success) setExits(data.exits);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoadingExits(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.product_description || !form.reason || !form.authorized_by) {
      alert(t("required_fields"));
      return;
    }

    try {
      setSaving(true);
      const res = await fetch("/api/rma/exit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          case_id: form.case_id ? parseInt(form.case_id, 10) : null,
          quantity: parseInt(form.quantity, 10) || 1,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setForm({
          case_id: "",
          product_description: "",
          quantity: "1",
          reason: "",
          exit_date: new Date().toISOString().split("T")[0],
          authorized_by: "",
          notes: "",
        });
        fetchExits();
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 sm:p-8 space-y-6 bg-slate-50/30 min-h-screen max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push(`/${locale}/rma`)}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex items-center gap-3">
          <div className="p-3 bg-orange-100 rounded-xl">
            <Truck className="w-6 h-6 text-orange-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t("salida_title")}</h1>
            <p className="text-sm text-slate-500">{t("salida_desc")}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Form */}
        <Card className="rounded-3xl border-none shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-slate-900">{t("new_exit")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label className="text-sm font-medium text-slate-700">{t("case_number_optional")}</Label>
                <Input
                  value={form.case_id}
                  onChange={(e) => handleChange("case_id", e.target.value)}
                  placeholder={t("case_number_placeholder")}
                />
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-700">{t("product_description")} *</Label>
                <Input
                  value={form.product_description}
                  onChange={(e) => handleChange("product_description", e.target.value)}
                  placeholder={t("product_description_placeholder")}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-slate-700">{t("quantity")}</Label>
                  <Input
                    type="number"
                    value={form.quantity}
                    onChange={(e) => handleChange("quantity", e.target.value)}
                    min="1"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium text-slate-700">{t("exit_date")} *</Label>
                  <Input
                    type="date"
                    value={form.exit_date}
                    onChange={(e) => handleChange("exit_date", e.target.value)}
                    required
                  />
                </div>
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-700">{t("reason")} *</Label>
                <Textarea
                  value={form.reason}
                  onChange={(e) => handleChange("reason", e.target.value)}
                  placeholder={t("reason_placeholder")}
                  rows={3}
                  required
                />
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-700">{t("authorized_by")} *</Label>
                <Input
                  value={form.authorized_by}
                  onChange={(e) => handleChange("authorized_by", e.target.value)}
                  placeholder={t("authorized_placeholder")}
                  required
                />
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-700">{t("notes")}</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => handleChange("notes", e.target.value)}
                  placeholder={t("notes_placeholder")}
                  rows={2}
                />
              </div>
              <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white" disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                {t("register_exit")}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* History */}
        <Card className="rounded-3xl border-none shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-slate-900">{t("exit_history")}</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingExits ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
              </div>
            ) : exits.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Truck className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>{t("no_exits")}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {exits.map((exit) => (
                  <div key={exit.id} className="border rounded-xl p-4 bg-white">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium text-slate-900">{exit.product_description}</p>
                        <p className="text-sm text-slate-500">
                          {t("quantity")}: {exit.quantity} • {exit.exit_date}
                        </p>
                        {exit.case_number && (
                          <p className="text-xs text-blue-600 mt-1">RMA N.º {exit.case_number}</p>
                        )}
                      </div>
                      <p className="text-xs text-slate-400">{exit.authorized_by}</p>
                    </div>
                    <p className="text-sm text-slate-600 mt-2">{exit.reason}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
