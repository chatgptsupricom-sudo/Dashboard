"use client";

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
import { ArrowLeft, Loader2, Save, Wrench } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";

const empresas = [
  { id: 9, name: "Valencia" },
  { id: 10, name: "Caracas" },
  { id: 7, name: "Panamá" },
];

export default function RmaNuevoPage() {
  const t = useTranslations("rma");
  const params = useParams();
  const router = useRouter();
  const locale = (params?.locale as string) || "es";

  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    client_name: "",
    client_phone: "",
    product_name: "",
    product_serial: "",
    product_model: "",
    reported_fault: "",
    company_id: "9",
    notes: "",
  });

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.client_name || !form.product_name || !form.reported_fault) {
      alert(t("required_fields"));
      return;
    }

    try {
      setSaving(true);
      const res = await fetch("/api/rma", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          company_id: parseInt(form.company_id, 10),
          created_by: "Usuario Actual",
        }),
      });

      const data = await res.json();
      if (data.success) {
        router.push(`/${locale}/rma/casos/${data.id}`);
      } else {
        alert(data.error || "Error al crear caso");
      }
    } catch (error) {
      console.error("Error:", error);
      alert("Error al crear caso");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 sm:p-8 space-y-6 bg-slate-50/30 min-h-screen max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push(`/${locale}/rma`)}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-100 rounded-xl">
            <Wrench className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t("new_case")}</h1>
            <p className="text-sm text-slate-500">{t("new_case_desc")}</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Client Info */}
        <Card className="rounded-3xl border-none shadow-sm mb-6">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-slate-900">{t("client_info")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium text-slate-700">{t("client_name")} *</Label>
                <Input
                  value={form.client_name}
                  onChange={(e) => handleChange("client_name", e.target.value)}
                  placeholder={t("client_name_placeholder")}
                  required
                />
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-700">{t("client_phone")}</Label>
                <Input
                  value={form.client_phone}
                  onChange={(e) => handleChange("client_phone", e.target.value)}
                  placeholder="+58 412 1234567"
                />
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-700">{t("company")} *</Label>
                <Select value={form.company_id} onValueChange={(v) => handleChange("company_id", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {empresas.map((e) => (
                      <SelectItem key={e.id} value={String(e.id)}>
                        {e.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Product Info */}
        <Card className="rounded-3xl border-none shadow-sm mb-6">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-slate-900">{t("product_info")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium text-slate-700">{t("product_name")} *</Label>
                <Input
                  value={form.product_name}
                  onChange={(e) => handleChange("product_name", e.target.value)}
                  placeholder={t("product_name_placeholder")}
                  required
                />
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-700">{t("product_model")}</Label>
                <Input
                  value={form.product_model}
                  onChange={(e) => handleChange("product_model", e.target.value)}
                  placeholder={t("product_model_placeholder")}
                />
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-700">{t("product_serial")}</Label>
                <Input
                  value={form.product_serial}
                  onChange={(e) => handleChange("product_serial", e.target.value)}
                  placeholder={t("product_serial_placeholder")}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Fault Description */}
        <Card className="rounded-3xl border-none shadow-sm mb-6">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-slate-900">{t("fault_info")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-sm font-medium text-slate-700">{t("reported_fault")} *</Label>
              <Textarea
                value={form.reported_fault}
                onChange={(e) => handleChange("reported_fault", e.target.value)}
                placeholder={t("reported_fault_placeholder")}
                rows={4}
                required
              />
            </div>
            <div>
              <Label className="text-sm font-medium text-slate-700">{t("notes")}</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => handleChange("notes", e.target.value)}
                placeholder={t("notes_placeholder")}
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Link href={`/${locale}/rma`}>
            <Button type="button" variant="outline">
              {t("cancel")}
            </Button>
          </Link>
          <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white" disabled={saving}>
            {saving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            {t("save_case")}
          </Button>
        </div>
      </form>
    </div>
  );
}
