"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, FileText, ImagePlus, Loader2, Printer, Save, Search, X } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

export default function RmaNotaCreditoPage() {
  const t = useTranslations("rma");
  const params = useParams();
  const router = useRouter();
  const locale = (params?.locale as string) || "es";
  const printRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();

  const [caseNumber, setCaseNumber] = useState("");
  const [caseData, setCaseData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [notaId, setNotaId] = useState<number | null>(null);

  const [detail, setDetail] = useState("");
  const [observations, setObservations] = useState("");
  const [images, setImages] = useState<{ name: string; url: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-search when coming from status change
  useEffect(() => {
    const caseParam = searchParams.get("case");
    if (caseParam) {
      setCaseNumber(caseParam);
      // Trigger search after a tick
      setTimeout(() => {
        handleSearchDirect(caseParam);
      }, 100);
    }
  }, [searchParams]);

  const handleSearchDirect = async (num: string) => {
    if (!num.trim()) return;
    try {
      setLoading(true);
      setSearched(true);
      const res = await fetch(`/api/rma/${num.trim()}`);
      const data = await res.json();
      if (data.success) {
        setCaseData(data.case);
        const ncRes = await fetch(`/api/rma/nota-credito?case_id=${data.case.id}`);
        const ncData = await ncRes.json();
        if (ncData.success && ncData.nota) {
          setDetail(ncData.nota.detail || "");
          setObservations(ncData.nota.observations || "");
          const imgs = ncData.nota.images;
          setImages(Array.isArray(imgs) ? imgs : typeof imgs === "string" ? JSON.parse(imgs) : []);
          setNotaId(ncData.nota.id);
          setSaved(true);
        }
      } else {
        setCaseData(null);
      }
    } catch (error) {
      console.error("Error:", error);
      setCaseData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!caseNumber.trim()) return;
    try {
      setLoading(true);
      setSearched(true);
      const res = await fetch(`/api/rma/${caseNumber.trim()}`);
      const data = await res.json();
      if (data.success) {
        setCaseData(data.case);
        // Check if nota already exists
        const ncRes = await fetch(`/api/rma/nota-credito?case_id=${data.case.id}`);
        const ncData = await ncRes.json();
        if (ncData.success && ncData.nota) {
          setDetail(ncData.nota.detail || "");
          setObservations(ncData.nota.observations || "");
          const imgs = ncData.nota.images;
          setImages(Array.isArray(imgs) ? imgs : typeof imgs === "string" ? JSON.parse(imgs) : []);
          setNotaId(ncData.nota.id);
          setSaved(true);
        }
      } else {
        setCaseData(null);
      }
    } catch (error) {
      console.error("Error:", error);
      setCaseData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setImages((prev) => [
          ...prev,
          { name: file.name, url: ev.target?.result as string },
        ]);
      };
      reader.readAsDataURL(file);
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRemoveImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!caseData) return;
    try {
      setSaving(true);
      const res = await fetch("/api/rma/nota-credito", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          case_id: caseData.id,
          detail,
          observations,
          images,
          created_by: "Usuario Actual",
        }),
      });
      const data = await res.json();
      if (data.success) {
        setNotaId(data.id);
        setSaved(true);
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>REPORTE TECNICO - RMA N.° ${caseData?.case_number || ""}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; padding: 30px; color: #000; }
          .header { display: flex; align-items: center; gap: 20px; margin-bottom: 20px; border-bottom: 2px solid #0066cc; padding-bottom: 15px; }
          .header-title { flex: 1; text-align: center; }
          .header-title h1 { font-size: 22px; font-weight: bold; }
          .header-title p { font-size: 14px; margin-top: 4px; }
          .case-number { background: #0066cc; color: white; padding: 6px 14px; font-weight: bold; font-size: 14px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th { background: #0066cc; color: white; padding: 10px 8px; text-align: left; font-size: 12px; text-transform: uppercase; border: 1px solid #0055aa; }
          td { padding: 10px 8px; border: 1px solid #ccc; font-size: 13px; vertical-align: top; }
          .section-title { font-weight: bold; font-size: 14px; margin: 20px 0 10px 0; text-transform: uppercase; }
          .observations-box { border: 1px solid #ccc; padding: 15px; min-height: 200px; margin-bottom: 20px; }
          .images-grid { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 20px; }
          .images-grid img { max-width: 200px; max-height: 200px; border: 1px solid #ccc; object-fit: cover; }
          .detail-text { margin-bottom: 20px; line-height: 1.6; }
          .signature { margin-top: 60px; text-align: center; border-top: 1px solid #000; padding-top: 10px; width: 300px; margin-left: auto; margin-right: auto; }
          .signature p { font-size: 13px; }
          .signature strong { font-size: 14px; }
          @media print { body { padding: 15px; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="header-title">
            <h1>REPORTE TECNICO</h1>
            <p>Fecha: ${new Date().toLocaleDateString("es-VE")}</p>
          </div>
          <div class="case-number">N° DE ${caseData?.case_number || ""}</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Hardware</th>
              <th>Marca</th>
              <th>Modelo</th>
              <th>Factura</th>
              <th>Cliente</th>
              <th>Serial/Cant.</th>
              <th>Detalle</th>
              <th>Estatus</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>${caseData?.hardware || ""}</td>
              <td>${caseData?.brand || ""}</td>
              <td>${caseData?.model || ""}</td>
              <td>${caseData?.invoice_number || ""}</td>
              <td>${caseData?.client_name || ""}</td>
              <td>${caseData?.serial_quantity || ""}</td>
              <td>${detail || caseData?.diagnosis || ""}</td>
              <td>${caseData?.status?.replace("_", " ")?.toUpperCase() || ""}</td>
            </tr>
          </tbody>
        </table>
        <div class="section-title">OBSERVACIONES:</div>
        <div class="observations-box">
          <div class="detail-text">${observations || caseData?.reported_fault || ""}</div>
          ${images.length > 0 ? `<div class="images-grid">${images.map((img) => `<img src="${img.url}" alt="${img.name}" />`).join("")}</div>` : ""}
        </div>
        <div class="signature">
          <strong>ING. Manuel García</strong>
          <p>Especialista de TI</p>
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 500);
  };

  return (
    <div className="p-4 sm:p-8 space-y-6 bg-slate-50/30 min-h-screen max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push(`/${locale}/rma`)}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-100 rounded-xl">
              <FileText className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{t("nota_credito_title")}</h1>
              <p className="text-sm text-slate-500">{t("nota_credito_desc")}</p>
            </div>
          </div>
        </div>
        {saved && (
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="w-4 h-4 mr-2" />
            {t("print_pdf")}
          </Button>
        )}
      </div>

      {/* Search */}
      {!caseData && (
        <Card className="rounded-3xl border-none shadow-sm">
          <CardContent className="p-6">
            <div className="flex gap-3">
              <div className="flex-1">
                <Label className="text-sm font-medium text-slate-700">{t("case_number")}</Label>
                <Input
                  value={caseNumber}
                  onChange={(e) => setCaseNumber(e.target.value)}
                  placeholder={t("nota_credito_placeholder")}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  className="mt-1"
                />
              </div>
              <div className="flex items-end">
                <Button onClick={handleSearch} disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Report Form */}
      {caseData && (
        <>
          <div ref={printRef}>
            {/* Product Info Table */}
            <Card className="rounded-3xl border-none shadow-sm mb-6">
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-slate-900">{t("technical_report")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between mb-4 border-b pb-3">
                  <div>
                    <p className="text-sm text-slate-400">{t("case_number")}</p>
                    <p className="text-xl font-bold text-slate-900">RMA N.° {caseData.case_number}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-slate-400">{t("date")}</p>
                    <p className="text-sm text-slate-700">{new Date().toLocaleDateString("es-VE")}</p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-blue-600 text-white">
                        <th className="p-2 text-left text-xs">{t("hardware")}</th>
                        <th className="p-2 text-left text-xs">{t("brand")}</th>
                        <th className="p-2 text-left text-xs">{t("model")}</th>
                        <th className="p-2 text-left text-xs">{t("invoice_number")}</th>
                        <th className="p-2 text-left text-xs">{t("client_name")}</th>
                        <th className="p-2 text-left text-xs">{t("serial_quantity")}</th>
                        <th className="p-2 text-left text-xs">{t("detail")}</th>
                        <th className="p-2 text-left text-xs">{t("status_label")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border">
                        <td className="p-2 border">{caseData.hardware || ""}</td>
                        <td className="p-2 border">{caseData.brand || ""}</td>
                        <td className="p-2 border">{caseData.model || ""}</td>
                        <td className="p-2 border">{caseData.invoice_number || ""}</td>
                        <td className="p-2 border">{caseData.client_name || ""}</td>
                        <td className="p-2 border">{caseData.serial_quantity || ""}</td>
                        <td className="p-2 border">{detail || caseData.diagnosis || ""}</td>
                        <td className="p-2 border uppercase font-semibold">{caseData.status?.replace("_", " ")}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Detail */}
            <Card className="rounded-3xl border-none shadow-sm mb-6">
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-slate-900">{t("detail")}</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={detail}
                  onChange={(e) => setDetail(e.target.value)}
                  placeholder={t("detail_placeholder")}
                  rows={3}
                />
              </CardContent>
            </Card>

            {/* Observations + Images */}
            <Card className="rounded-3xl border-none shadow-sm mb-6">
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-slate-900">{t("observations")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  value={observations}
                  onChange={(e) => setObservations(e.target.value)}
                  placeholder={t("observations_placeholder")}
                  rows={6}
                />

                {/* Image Upload */}
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleImageUpload}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <ImagePlus className="w-4 h-4 mr-2" />
                    {t("add_images")}
                  </Button>
                </div>

                {images.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {images.map((img, i) => (
                      <div key={i} className="relative group border rounded-xl overflow-hidden">
                        <img
                          src={img.url}
                          alt={img.name}
                          className="w-full h-32 object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveImage(i)}
                          className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-3 h-3" />
                        </button>
                        <p className="text-[10px] text-slate-500 px-2 py-1 truncate">{img.name}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Actions */}
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => { setCaseData(null); setSearched(false); setSaved(false); setDetail(""); setObservations(""); setImages([]); }}>
              {t("back_to_search")}
            </Button>
            <div className="flex gap-3">
              <Button variant="outline" onClick={handlePrint}>
                <Printer className="w-4 h-4 mr-2" />
                {t("print_pdf")}
              </Button>
              <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 text-white" disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                {t("save")}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
