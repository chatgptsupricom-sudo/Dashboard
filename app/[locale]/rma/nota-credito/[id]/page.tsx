"use client";

import { colorSolicitud, etiquetaSolicitud, fechaCorta } from "@/components/rma/estados";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, FileText, Loader2, Printer } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

const esc = (v: unknown) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Documento de una nota de crédito aprobada (reporte técnico para imprimir). */
export default function DocumentoNotaCreditoPage() {
  const t = useTranslations("rma");
  const params = useParams();
  const router = useRouter();
  const locale = (params?.locale as string) || "es";
  const id = params?.id as string;

  const [nota, setNota] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/rma/nota-credito/${id}`);
        const data = await res.json();
        if (data.success) setNota(data.nota);
        else setError(data.error || t("nc_error_cargar"));
      } catch {
        setError(t("nc_error_cargar"));
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const imprimir = () => {
    if (!nota) return;
    const w = window.open("", "_blank");
    if (!w) return;
    const imagenes: any[] = Array.isArray(nota.images) ? nota.images : [];
    w.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>NOTA DE CREDITO - RMA N.° ${esc(nota.case_number)}</title>
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
          .box { border: 1px solid #ccc; padding: 15px; margin-bottom: 20px; line-height: 1.6; white-space: pre-wrap; }
          .images-grid { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 20px; }
          .images-grid img { max-width: 200px; max-height: 200px; border: 1px solid #ccc; object-fit: cover; }
          .aprobacion { font-size: 12px; color: #333; margin-bottom: 20px; }
          .signature { margin-top: 60px; text-align: center; border-top: 1px solid #000; padding-top: 10px; width: 300px; margin-left: auto; margin-right: auto; }
          .signature p { font-size: 13px; }
          .signature strong { font-size: 14px; }
          @media print { body { padding: 15px; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="header-title">
            <h1>REPORTE TECNICO - NOTA DE CREDITO</h1>
            <p>Fecha: ${esc(fechaCorta(nota.decidido_at || nota.created_at))}</p>
          </div>
          <div class="case-number">N° DE ${esc(nota.case_number)}</div>
        </div>
        <table>
          <thead>
            <tr><th>Hardware</th><th>Marca</th><th>Modelo</th><th>Factura</th><th>Cliente</th><th>Serial</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>${esc(nota.hardware)}</td><td>${esc(nota.brand)}</td><td>${esc(nota.model)}</td>
              <td>${esc(nota.invoice_number)}</td><td>${esc(nota.client_name)}</td><td>${esc(nota.serial)}</td>
            </tr>
          </tbody>
        </table>
        <div class="section-title">Falla reportada:</div>
        <div class="box">${esc(nota.reported_fault || nota.detail)}</div>
        <div class="section-title">Motivo de la nota de crédito:</div>
        <div class="box">${esc(nota.motivo)}${nota.observations ? `\n\n${esc(nota.observations)}` : ""}</div>
        ${imagenes.length ? `<div class="images-grid">${imagenes
          .filter((i) => typeof i?.url === "string" && i.url.startsWith("data:image/"))
          .map((i) => `<img src="${esc(i.url)}" alt="${esc(i.name)}" />`)
          .join("")}</div>` : ""}
        <p class="aprobacion">Aprobada por ${esc(nota.decidido_por)} el ${esc(fechaCorta(nota.decidido_at))}. Solicitada por ${esc(nota.created_by)}.</p>
        <div class="signature">
          <strong>ING. Manuel García</strong>
          <p>Especialista de TI</p>
        </div>
      </body>
      </html>
    `);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 500);
  };

  return (
    <div className="p-4 sm:p-8 space-y-6 bg-slate-50/30 min-h-screen max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push(`/${locale}/rma/nota-credito`)}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="p-3 bg-purple-100 rounded-xl">
            <FileText className="w-6 h-6 text-purple-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{t("nota_credito_title")}</h1>
        </div>
        {nota?.estado === "aprobada" && (
          <Button variant="outline" onClick={imprimir}>
            <Printer className="w-4 h-4 mr-2" />
            {t("print_pdf")}
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
        </div>
      ) : error || !nota ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : (
        <Card className="rounded-3xl border-none shadow-sm">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-lg font-semibold text-slate-900">RMA N.° {nota.case_number}</CardTitle>
              <Badge className={`${colorSolicitud[nota.estado] || ""} border`}>{etiquetaSolicitud[nota.estado] || nota.estado}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {nota.estado !== "aprobada" && (
              <p className="rounded-xl bg-orange-50 px-4 py-3 text-orange-800">{t("nc_documento_solo_aprobada")}</p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-blue-600 text-white">
                    {[t("hardware"), t("brand"), t("model"), t("invoice_number"), t("client_name"), t("serial_quantity")].map((h) => (
                      <th key={h} className="p-2 text-left text-xs">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {[nota.hardware, nota.brand, nota.model, nota.invoice_number, nota.client_name, nota.serial].map((v, i) => (
                      <td key={i} className="p-2 border">{v || ""}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            <div>
              <p className="font-semibold text-slate-700">{t("reported_fault")}</p>
              <p className="text-slate-600 whitespace-pre-wrap">{nota.reported_fault || nota.detail || "—"}</p>
            </div>
            <div>
              <p className="font-semibold text-slate-700">{t("nc_motivo")}</p>
              <p className="text-slate-600 whitespace-pre-wrap">{nota.motivo || "—"}</p>
              {nota.observations && <p className="text-slate-500 whitespace-pre-wrap mt-2">{nota.observations}</p>}
            </div>
            {Array.isArray(nota.images) && nota.images.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {nota.images.map((img: any, i: number) => (
                  <img key={i} src={img.url} alt={img.name || ""} className="w-full h-32 object-cover rounded-xl border" />
                ))}
              </div>
            )}
            {nota.estado === "aprobada" && (
              <p className="text-xs text-slate-500">
                {t("nc_aprobada_por", { autor: nota.decidido_por || "—", fecha: fechaCorta(nota.decidido_at) })}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
