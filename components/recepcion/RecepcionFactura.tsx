"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { FileText, Loader2, PackageOpen, Search } from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth.store";
import { fechaCorta } from "@/lib/fecha";
import { SUCURSALES } from "@/lib/recepcion/flujo";
import type { FacturaParaRecibir } from "@/lib/recepcion/odoo";
import {
  PageHeader,
  Card,
  SectionTitle,
  BotonPrimario,
  BotonSecundario,
  inputClases,
  labelClases,
} from "@/components/seguridad/mercancia-ui";

/**
 * Almacen arranca la recepcion de la mercancia que otra sede le vendio
 * (Valencia -> Caracas) con el numero de esa factura: el panel trae los
 * productos de la factura y propone la OC de Odoo de la sede que la espera.
 * Despues se cuenta, se pistolea y se cierra como un packing list, y al
 * cerrar se carga en Odoo.
 */

const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n || 0);

export default function RecepcionFactura({ base }: { base: string }) {
  const t = useTranslations("recepcion");
  const router = useRouter();
  const { user } = useAuthStore();
  const rol = (user?.role || "").toLowerCase().trim();
  const propia = Number((user as any)?.cids) || 0;

  // Almacen recibe en su sucursal; el superadmin elige (Caracas por defecto).
  const [cids, setCids] = useState<number>(rol === "superadmin" ? 10 : propia);
  const [numero, setNumero] = useState("");
  const [datos, setDatos] = useState<FacturaParaRecibir | null>(null);
  const [oc, setOc] = useState<number | "">("");
  const [buscando, setBuscando] = useState(false);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existente, setExistente] = useState<number | null>(null);

  const buscar = async () => {
    if (!numero.trim()) return;
    setError(null);
    setExistente(null);
    setDatos(null);
    setBuscando(true);
    try {
      const res = await fetch(`/api/recepcion/factura?numero=${encodeURIComponent(numero.trim())}&cids=${cids}`);
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || t("error"));
      setDatos(j);
      setOc(j.candidatas?.[0]?.id ?? "");
    } catch (e: any) {
      setError(e?.message || t("error"));
    } finally {
      setBuscando(false);
    }
  };

  const crear = async () => {
    if (!datos || !oc) return;
    setError(null);
    setCreando(true);
    try {
      const res = await fetch("/api/recepcion/factura", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numero: datos.factura.nombre, purchase_order_id: oc, cids }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.status === 409 && j.id) {
        setExistente(Number(j.id));
        throw new Error(j.error);
      }
      if (!res.ok) throw new Error(j.error || t("error"));
      router.push(`${base}/${j.id}`);
    } catch (e: any) {
      setError(e?.message || t("error"));
      setCreando(false);
    }
  };

  const elegida = datos?.candidatas.find((c) => c.id === oc);

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <PageHeader icon={FileText} titulo={t("factura.titulo")} subtitulo={t("factura.sub")} volverA={base} />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-4 pb-32">
        <Card className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-[12rem_minmax(0,1fr)] gap-4">
            {rol === "superadmin" ? (
              <div>
                <label className={labelClases}>{t("sucursal")}</label>
                <select
                  value={cids}
                  onChange={(e) => {
                    setCids(Number(e.target.value));
                    setDatos(null);
                  }}
                  className={inputClases}
                >
                  {SUCURSALES.map((s) => (
                    <option key={s.cids} value={s.cids}>
                      {s.nombre}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <p className={labelClases}>{t("sucursal")}</p>
                <p className="h-11 flex items-center text-sm font-medium text-slate-800">
                  {SUCURSALES.find((s) => s.cids === cids)?.nombre ?? "—"}
                </p>
              </div>
            )}
            <div>
              <label className={labelClases} htmlFor="numero-factura">
                {t("factura.numero")}
              </label>
              <div className="flex gap-2">
                <input
                  id="numero-factura"
                  value={numero}
                  onChange={(e) => setNumero(e.target.value.slice(0, 50))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void buscar();
                    }
                  }}
                  placeholder="5038581"
                  inputMode="numeric"
                  autoFocus
                  className={`${inputClases} font-mono`}
                />
                <BotonSecundario onClick={() => void buscar()} disabled={buscando || !numero.trim()} icon={buscando ? Loader2 : Search}>
                  {t("factura.buscar")}
                </BotonSecundario>
              </div>
            </div>
          </div>
          <p className="text-xs text-slate-500">{t("factura.ayuda")}</p>
        </Card>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
            {existente && (
              <Link href={`${base}/${existente}`} className="ml-2 font-semibold underline">
                {t("factura.ver_existente")}
              </Link>
            )}
          </div>
        )}

        {datos && (
          <>
            <Card>
              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
                <Dato etiqueta={t("factura.factura")} valor={datos.factura.nombre} />
                <Dato etiqueta={t("factura.de")} valor={datos.factura.sede_origen} />
                <Dato etiqueta={t("factura.fecha")} valor={datos.factura.fecha ? fechaCorta(datos.factura.fecha) : null} />
                <Dato etiqueta={t("factura.total")} valor={usd(datos.factura.total)} />
              </dl>
            </Card>

            <Card className="space-y-3">
              <SectionTitle>{t("oc_odoo")}</SectionTitle>
              {datos.candidatas.length === 0 ? (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  {t("factura.sin_oc", { sede: SUCURSALES.find((s) => s.cids === cids)?.nombre ?? "" })}
                </p>
              ) : (
                <>
                  <select
                    value={oc}
                    onChange={(e) => setOc(e.target.value ? Number(e.target.value) : "")}
                    className={inputClases}
                    aria-label={t("oc_odoo")}
                  >
                    {datos.candidatas.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre} — {c.proveedor} — {usd(c.total)}
                      </option>
                    ))}
                  </select>
                  {elegida && (
                    <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold">
                      {elegida.por_factura_proveedor && (
                        <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-emerald-700">
                          {t("factura.por_factura_proveedor")}
                        </span>
                      )}
                      {elegida.mismo_total && (
                        <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-emerald-700">{t("factura.mismo_total")}</span>
                      )}
                      <span
                        className={`rounded-md px-2 py-0.5 ${
                          elegida.cobertura >= 1 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {t("factura.cobertura", { pct: Math.round(elegida.cobertura * 100) })}
                      </span>
                      {elegida.parcial && (
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-slate-600">{t("oc_odoo_parcial")}</span>
                      )}
                    </div>
                  )}
                  <p className="text-xs text-slate-500">{t("factura.oc_ayuda")}</p>
                </>
              )}
            </Card>

            <Card>
              <SectionTitle>
                {t("renglones")} ({datos.lineas.length})
              </SectionTitle>
              <div className="grid grid-cols-[minmax(0,1fr)_5rem] gap-x-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400 pb-2 border-b border-slate-100">
                <span>{t("producto")}</span>
                <span className="text-right">{t("cantidad")}</span>
              </div>
              {datos.lineas.map((l) => (
                <div key={l.product_id} className="grid grid-cols-[minmax(0,1fr)_5rem] gap-x-2 py-2 border-b border-slate-50 last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm text-slate-800 truncate">{l.producto}</p>
                    <p className="text-[11px] text-slate-400 font-mono">{l.codigo || "—"}</p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-slate-700 text-right">{l.cantidad}</span>
                </div>
              ))}
            </Card>

            <BotonPrimario
              onClick={() => void crear()}
              disabled={creando || !oc}
              icon={creando ? Loader2 : PackageOpen}
              className="w-full h-12"
            >
              {t("factura.empezar")}
            </BotonPrimario>
          </>
        )}
      </main>
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium text-slate-400">{etiqueta}</dt>
      <dd className="text-sm text-slate-800 truncate">{valor || "—"}</dd>
    </div>
  );
}
