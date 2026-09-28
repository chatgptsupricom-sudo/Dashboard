"use client";

import { colorEstado, etiquetaEstado } from "@/components/rma/estados";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, FileText, ImagePlus, Loader2, Search, Send, X } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

/** Estados desde los que se puede pedir (lib/rma/notaCredito.ts, sePuedeSolicitar). */
const SOLICITABLE = ["recibido", "reingresado"];
const MAX_IMAGENES = 10;
const MAX_BYTES = 3 * 1024 * 1024;

export default function SolicitarNotaCreditoPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
        </div>
      }
    >
      <SolicitarNotaCredito />
    </Suspense>
  );
}

function SolicitarNotaCredito() {
  const t = useTranslations("rma");
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = (params?.locale as string) || "es";
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<any[] | null>(null);
  const [buscando, setBuscando] = useState(false);

  const [caso, setCaso] = useState<any | null>(null);
  const [productos, setProductos] = useState<any[]>([]);
  const [itemId, setItemId] = useState<number | null>(null);
  const [cargandoCaso, setCargandoCaso] = useState(false);

  const [motivo, setMotivo] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [imagenes, setImagenes] = useState<{ name: string; url: string }[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  // Llega con ?case= (y ?item=) desde el cambio de estado del caso.
  useEffect(() => {
    const c = searchParams?.get("case");
    if (c) elegirCaso(c, parseInt(searchParams?.get("item") || "", 10) || null);
  }, [searchParams]);

  const buscar = async () => {
    if (!busqueda.trim()) return;
    try {
      setBuscando(true);
      const q = new URLSearchParams({ search: busqueda.trim(), procedencia: "supricom", limit: "10" });
      const res = await fetch(`/api/rma?${q}`);
      const data = await res.json();
      setResultados(data.success ? data.cases : []);
    } catch {
      setResultados([]);
    } finally {
      setBuscando(false);
    }
  };

  const elegirCaso = async (idOCaso: string | number, item: number | null = null) => {
    try {
      setCargandoCaso(true);
      setError("");
      const res = await fetch(`/api/rma/${idOCaso}`);
      const data = await res.json();
      if (!data.success) {
        setError(data.error || t("nc_caso_no_encontrado"));
        return;
      }
      if (Number(data.case.producto_externo) === 1) {
        setError(t("nc_no_externo"));
        return;
      }
      const items: any[] = data.items || [];
      setCaso(data.case);
      setProductos(items);
      if (items.length > 1) {
        const elegible = items.filter((i) => SOLICITABLE.includes(i.status));
        setItemId(item && items.some((i) => i.id === item) ? item : elegible.length === 1 ? elegible[0].id : null);
      } else {
        setItemId(items[0]?.id ?? null);
      }
    } catch {
      setError(t("nc_caso_no_encontrado"));
    } finally {
      setCargandoCaso(false);
    }
  };

  const agregarImagenes = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      if (file.size > MAX_BYTES) {
        setError(t("nc_imagen_grande", { nombre: file.name }));
        continue;
      }
      const reader = new FileReader();
      reader.onload = (ev) =>
        setImagenes((prev) =>
          prev.length >= MAX_IMAGENES ? prev : [...prev, { name: file.name, url: ev.target?.result as string }],
        );
      reader.readAsDataURL(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const varios = productos.length > 1;
  const producto = varios ? productos.find((p) => p.id === itemId) : productos[0];
  const estado = varios ? producto?.status : caso?.status;
  const puede = !!caso && (!varios || !!producto) && SOLICITABLE.includes(estado);

  const enviar = async () => {
    if (!caso || !puede) return;
    try {
      setEnviando(true);
      setError("");
      const res = await fetch("/api/rma/nota-credito", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          case_id: caso.id,
          item_id: varios ? itemId : null,
          motivo,
          observations: observaciones,
          images: imagenes,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || t("nc_error_solicitar"));
        return;
      }
      router.push(`/${locale}/rma/nota-credito`);
    } catch {
      setError(t("nc_error_solicitar"));
    } finally {
      setEnviando(false);
    }
  };

  const reiniciar = () => {
    setCaso(null);
    setProductos([]);
    setItemId(null);
    setMotivo("");
    setObservaciones("");
    setImagenes([]);
    setError("");
  };

  return (
    <div className="p-4 sm:p-8 space-y-6 bg-slate-50/30 min-h-screen max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push(`/${locale}/rma/nota-credito`)}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="p-3 bg-purple-100 rounded-xl">
          <FileText className="w-6 h-6 text-purple-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t("nc_solicitar")}</h1>
          <p className="text-sm text-slate-500">{t("nc_solicitar_desc")}</p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* 1. Caso */}
      <Card className="rounded-3xl border-none shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-slate-900">1. {t("nc_paso_caso")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {caso ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-2xl bg-slate-50 p-4">
              <div>
                <p className="font-bold text-slate-900">RMA N.° {caso.case_number}</p>
                <p className="text-sm text-slate-500">
                  {caso.client_name}
                  {caso.invoice_number ? ` · ${t("invoice_number")} ${caso.invoice_number}` : ""}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={reiniciar}>{t("nc_cambiar_caso")}</Button>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <Input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && buscar()}
                  placeholder={t("nc_buscar_caso")}
                />
                <Button onClick={buscar} disabled={buscando} className="bg-blue-600 hover:bg-blue-700 text-white">
                  {buscando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                </Button>
              </div>
              {cargandoCaso && <Loader2 className="w-5 h-5 animate-spin text-slate-400" />}
              {resultados && (
                resultados.length === 0 ? (
                  <p className="text-sm text-slate-400">{t("no_cases")}</p>
                ) : (
                  <div className="divide-y rounded-2xl border">
                    {resultados.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => elegirCaso(c.id)}
                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-blue-600">RMA N.° {c.case_number}</p>
                          <p className="truncate text-xs text-slate-500">
                            {c.client_name} · {c.model || c.hardware || "—"}
                            {Number(c.productos_count) > 1 ? ` +${Number(c.productos_count) - 1}` : ""}
                          </p>
                        </div>
                        <Badge className={`${colorEstado[c.status] || ""} border text-[11px] shrink-0`}>
                          {etiquetaEstado[c.status] || c.status}
                        </Badge>
                      </button>
                    ))}
                  </div>
                )
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* 2. Producto */}
      {caso && (
        <Card className="rounded-3xl border-none shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-slate-900">2. {t("nc_paso_producto")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(varios ? productos : [producto ?? caso]).map((p: any) => {
              const est = varios ? p.status : caso.status;
              const elegible = SOLICITABLE.includes(est);
              const elegido = varios ? itemId === p.id : true;
              return (
                <label
                  key={p.id ?? "caso"}
                  className={`flex items-start gap-3 rounded-2xl border p-4 ${elegible ? "cursor-pointer hover:bg-slate-50" : "opacity-60"} ${elegido && elegible ? "border-purple-400 bg-purple-50/40" : ""}`}
                >
                  {varios && (
                    <input
                      type="radio"
                      name="producto"
                      className="mt-1"
                      disabled={!elegible}
                      checked={itemId === p.id}
                      onChange={() => setItemId(p.id)}
                    />
                  )}
                  <div className="flex-1 min-w-0 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-slate-800">{p.model || p.hardware || "—"}</p>
                      <Badge className={`${colorEstado[est] || ""} border text-[10px]`}>{etiquetaEstado[est] || est}</Badge>
                    </div>
                    <p className="text-slate-500">
                      {[p.hardware, p.brand].filter(Boolean).join(" · ")}
                      {(p.serial ?? p.serial_quantity) ? <span className="font-mono text-xs"> · {p.serial ?? p.serial_quantity}</span> : null}
                    </p>
                    {p.reported_fault && <p className="text-slate-500 mt-1">{t("reported_fault")}: {p.reported_fault}</p>}
                    {p.diagnosis && <p className="text-slate-500">{t("diagnosis")}: {p.diagnosis}</p>}
                    {!elegible && <p className="text-xs text-slate-400 mt-1">{t("nc_no_solicitable")}</p>}
                  </div>
                </label>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* 3. Por qué */}
      {caso && puede && (
        <Card className="rounded-3xl border-none shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-slate-900">3. {t("nc_paso_motivo")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-sm font-medium text-slate-700">{t("nc_motivo")} *</Label>
              <Textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder={t("nc_motivo_placeholder")}
                rows={5}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-sm font-medium text-slate-700">{t("observations")}</Label>
              <Textarea
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                placeholder={t("observations_placeholder")}
                rows={3}
                className="mt-1"
              />
            </div>
            <div className="space-y-3">
              <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={agregarImagenes} />
              <Button
                type="button"
                variant="outline"
                disabled={imagenes.length >= MAX_IMAGENES}
                onClick={() => fileInputRef.current?.click()}
              >
                <ImagePlus className="w-4 h-4 mr-2" />
                {t("add_images")}
              </Button>
              {imagenes.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                  {imagenes.map((img, i) => (
                    <div key={i} className="relative group border rounded-xl overflow-hidden">
                      <img src={img.url} alt={img.name} className="w-full h-24 object-cover" />
                      <button
                        type="button"
                        onClick={() => setImagenes((prev) => prev.filter((_, j) => j !== i))}
                        className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1"
                        aria-label={t("delete")}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <p className="text-xs text-slate-500">{t("nc_aviso_aprobacion")}</p>
            <div className="flex justify-end">
              <Button
                onClick={enviar}
                disabled={enviando || motivo.trim().length < 10}
                className="bg-purple-600 hover:bg-purple-700 text-white"
              >
                {enviando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                {t("nc_enviar")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
