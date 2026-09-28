"use client";

import { colorSolicitud, etiquetaSolicitud, fechaCorta } from "@/components/rma/estados";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ExternalLink, FileText, Loader2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

/**
 * Solicitudes de nota de crédito de RMA, las más nuevas primero. Las ve RMA
 * (su sección Nota de Crédito) y el Super Admin, a quien le llegan. Por ahora
 * solo se consultan: el proceso de la nota de crédito se define después.
 */
export function SolicitudesNotaCredito() {
  const t = useTranslations("rma");
  const params = useParams();
  const locale = (params?.locale as string) || "es";
  const [notas, setNotas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [imagen, setImagen] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/rma/nota-credito?lista=1");
        const data = await res.json();
        if (data.success) setNotas(data.notas);
        else setError(data.error || t("nc_error_cargar"));
      } catch {
        setError(t("nc_error_cargar"));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
        </div>
      ) : notas.length === 0 ? (
        <Card className="rounded-3xl border-none shadow-sm">
          <CardContent className="py-12 text-center text-slate-400">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>{t("nc_sin_solicitudes")}</p>
          </CardContent>
        </Card>
      ) : (
        notas.map((n) => (
          <Card key={n.id} className="rounded-3xl border-none shadow-sm">
            <CardContent className="p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/${locale}/rma/casos/${n.case_id}`}
                      className="text-lg font-bold text-blue-600 hover:underline inline-flex items-center gap-1"
                    >
                      RMA N.° {n.case_number}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                    <Badge className={`${colorSolicitud[n.estado] || ""} border text-[11px]`}>
                      {etiquetaSolicitud[n.estado] || n.estado}
                    </Badge>
                  </div>
                  <p className="text-sm text-slate-600 mt-0.5">
                    {n.client_name}
                    {n.invoice_number ? <span className="text-slate-400"> · {t("invoice_number")} {n.invoice_number}</span> : null}
                  </p>
                </div>
                <p className="text-xs text-slate-400 sm:text-right">
                  {t("nc_solicitada_por", { autor: n.created_by || "—" })}
                  <br />
                  {fechaCorta(n.created_at)}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="rounded-2xl bg-slate-50 p-4 space-y-1">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{t("nc_producto")}</p>
                  <p className="font-medium text-slate-800">{n.model || n.hardware || "—"}</p>
                  <p className="text-slate-500">
                    {[n.hardware, n.brand].filter(Boolean).join(" · ") || "—"}
                    {n.serial ? <span className="font-mono text-xs"> · {n.serial}</span> : null}
                  </p>
                  {n.reported_fault && (
                    <p className="text-slate-500 pt-1"><span className="font-medium text-slate-600">{t("reported_fault")}:</span> {n.reported_fault}</p>
                  )}
                  {n.diagnosis && (
                    <p className="text-slate-500"><span className="font-medium text-slate-600">{t("diagnosis")}:</span> {n.diagnosis}</p>
                  )}
                </div>
                <div className="rounded-2xl bg-orange-50/60 p-4 space-y-1">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-orange-700/70">{t("nc_motivo")}</p>
                  <p className="text-slate-800 whitespace-pre-wrap">{n.motivo || n.detail || "—"}</p>
                  {n.observations && (
                    <p className="text-slate-500 whitespace-pre-wrap pt-1">
                      <span className="font-medium text-slate-600">{t("observations")}:</span> {n.observations}
                    </p>
                  )}
                </div>
              </div>

              {Array.isArray(n.images) && n.images.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {n.images.map((img: any, i: number) => (
                    <button key={i} type="button" onClick={() => setImagen(img.url)} className="overflow-hidden rounded-xl border">
                      <img src={img.url} alt={img.name || ""} className="h-20 w-20 object-cover" />
                    </button>
                  ))}
                </div>
              )}

              {n.estado !== "pendiente" && (
                <div className={`rounded-xl px-4 py-2.5 text-sm ${n.estado === "aprobada" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>
                  {t(n.estado === "aprobada" ? "nc_aprobada_por" : "nc_rechazada_por", {
                    autor: n.decidido_por || "—",
                    fecha: fechaCorta(n.decidido_at),
                  })}
                  {n.motivo_rechazo && <p className="mt-1 whitespace-pre-wrap">{n.motivo_rechazo}</p>}
                </div>
              )}

            </CardContent>
          </Card>
        ))
      )}

      <Dialog open={!!imagen} onOpenChange={(o) => { if (!o) setImagen(null); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t("adjuntos")}</DialogTitle>
          </DialogHeader>
          {imagen && <img src={imagen} alt="" className="max-h-[70vh] w-full object-contain" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
