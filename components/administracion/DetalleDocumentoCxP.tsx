"use client";

import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NOMBRE_SEDE, fechaCorta, money } from "@/components/administracion/comunes";
import type { DetalleDocumentoCxP } from "@/lib/administracion/cxp";
import { ExternalLink, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

const ESTADO_PAGO: Record<string, string> = {
  not_paid: "Sin pagar",
  partial: "Pago parcial",
  in_payment: "Pagada (por conciliar)",
  paid: "Pagada",
  reversed: "Revertida",
};

/** Monto en la moneda del documento (Bs., etc.); en USD usa `money`. */
function enMoneda(n: number, moneda: string) {
  if (moneda === "USD") return money(n, 2);
  return `${moneda} ${n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Factura o NC de proveedor leida de Odoo: lineas, impuestos, pagos y
 * retenciones. Se abre desde Cuentas por Pagar; `id = null` la cierra.
 */
export function DetalleDocumentoCxP({
  id,
  empresa,
  onClose,
}: {
  id: number | null;
  empresa: string;
  onClose: () => void;
}) {
  const [doc, setDoc] = useState<DetalleDocumentoCxP | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let ignorar = false;
    setCargando(true);
    setError(null);
    setDoc(null);
    const qs = new URLSearchParams({ id: String(id) });
    if (empresa) qs.set("empresa", empresa);
    fetch(`/api/administracion/cuentas-por-pagar/documento?${qs.toString()}`, { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.success) throw new Error(json?.error || `HTTP ${res.status}`);
        return json.documento as DetalleDocumentoCxP;
      })
      .then((d) => !ignorar && setDoc(d))
      .catch((e) => !ignorar && setError(e.message))
      .finally(() => !ignorar && setCargando(false));
    return () => {
      ignorar = true;
    };
  }, [id, empresa]);

  const enUsd = doc?.moneda === "USD";

  return (
    <Dialog open={id !== null} onOpenChange={(abierto) => !abierto && onClose()}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 pr-6">
            <span className="font-mono">{doc?.numero || "Documento"}</span>
            {doc?.tipo === "nota_credito" && <Badge variant="outline">Nota de crédito</Badge>}
            {doc && (
              <Badge variant="outline" className="font-normal">
                {ESTADO_PAGO[doc.estadoPago] || doc.estadoPago}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>{doc ? `${doc.proveedor}${doc.rif ? ` · ${doc.rif}` : ""}` : " "}</DialogDescription>
        </DialogHeader>

        {cargando && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Leyendo el documento en Odoo…
          </div>
        )}
        {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        {doc && (
          <div className="space-y-5 text-sm">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2">
              <Dato titulo="Factura del proveedor" valor={doc.referencia || "—"} />
              <Dato titulo="Número de control" valor={doc.nroControl || "—"} />
              <Dato titulo="Fecha" valor={fechaCorta(doc.fecha)} />
              <Dato titulo="Vence" valor={fechaCorta(doc.vence)} />
              <Dato titulo="Plazo de pago" valor={doc.plazo || "Sin condición de pago"} />
              <Dato titulo="Sede" valor={NOMBRE_SEDE[doc.sede] || doc.sede} />
              <Dato
                titulo="Moneda"
                valor={enUsd ? "USD" : `${doc.moneda} · tasa ${(1 / (doc.tasa || 1)).toLocaleString("es-VE", { maximumFractionDigits: 2 })}`}
              />
              {doc.origen && <Dato titulo="Origen" valor={doc.origen} />}
            </div>

            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Descripción</th>
                    <th className="px-3 py-2 text-right font-medium">Cant.</th>
                    <th className="px-3 py-2 text-right font-medium">Precio</th>
                    <th className="px-3 py-2 text-right font-medium hidden sm:table-cell">Impuestos</th>
                    <th className="px-3 py-2 text-right font-medium">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {doc.lineas.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-gray-400">
                        Sin líneas.
                      </td>
                    </tr>
                  ) : (
                    doc.lineas.map((l, i) =>
                      l.tipo !== "producto" ? (
                        <tr key={i} className="bg-slate-50/60">
                          <td colSpan={5} className={`px-3 py-1.5 ${l.tipo === "seccion" ? "font-semibold" : "italic text-gray-500"}`}>
                            {l.descripcion}
                          </td>
                        </tr>
                      ) : (
                        <tr key={i}>
                          <td className="px-3 py-2 whitespace-normal">
                            <div>{l.descripcion || l.producto}</div>
                            {l.producto && l.descripcion && l.producto !== l.descripcion && (
                              <div className="text-xs text-gray-400">{l.producto}</div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {l.cantidad.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                            {enMoneda(l.precioUnitario, doc.moneda)}
                          </td>
                          <td className="px-3 py-2 text-right text-xs text-gray-500 hidden sm:table-cell">
                            {l.impuestos || "—"}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                            <div className="font-medium">{enMoneda(l.subtotal, doc.moneda)}</div>
                            {!enUsd && <div className="text-xs text-gray-400">{money(l.subtotalUsd, 2)}</div>}
                          </td>
                        </tr>
                      ),
                    )
                  )}
                </tbody>
              </table>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Pagos y retenciones aplicados</div>
                {doc.pagos.length === 0 ? (
                  <p className="text-gray-400">Sin pagos aplicados.</p>
                ) : (
                  <ul className="divide-y rounded-md border">
                    {doc.pagos.map((p, i) => (
                      <li key={i} className="flex items-start justify-between gap-3 px-3 py-2">
                        <div className="min-w-0">
                          <div className="break-words">{p.nombre}</div>
                          <div className="text-xs text-gray-400">
                            {fechaCorta(p.fecha)} · {p.diario}
                            {p.esRetencion && <span className="ml-1 text-violet-600">retención</span>}
                          </div>
                        </div>
                        <div className="text-right tabular-nums whitespace-nowrap">
                          <div className="font-medium">{money(p.montoUsd, 2)}</div>
                          {!enUsd && <div className="text-xs text-gray-400">{enMoneda(p.monto, doc.moneda)}</div>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {(doc.retencionIva || doc.retencionIslr) && (
                  <p className="text-xs text-gray-500">
                    {doc.retencionIva && <>Ret. IVA: {doc.retencionIva}. </>}
                    {doc.retencionIslr && <>Ret. ISLR: {doc.retencionIslr}.</>}
                  </p>
                )}
              </div>

              <div className="space-y-1.5 rounded-md bg-slate-50 p-3">
                <Fila titulo="Base imponible" usd={doc.baseUsd} />
                <Fila titulo="Impuestos" usd={doc.impuestoUsd} />
                <Fila
                  titulo="Total"
                  usd={doc.totalUsd}
                  origen={!enUsd ? enMoneda(doc.total, doc.moneda) : undefined}
                  fuerte
                />
                <Fila
                  titulo="Saldo por pagar"
                  usd={doc.saldoUsd}
                  origen={!enUsd ? enMoneda(doc.saldo, doc.moneda) : undefined}
                  fuerte
                  rojo={doc.saldoUsd > 0}
                />
              </div>
            </div>

            {doc.urlOdoo.startsWith("http") && (
              <a
                href={doc.urlOdoo}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline"
              >
                Abrir en Odoo <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-gray-500">{titulo}</div>
      <div className="font-medium break-words">{valor}</div>
    </div>
  );
}

function Fila({
  titulo,
  usd,
  origen,
  fuerte,
  rojo,
}: {
  titulo: string;
  usd: number;
  origen?: string;
  fuerte?: boolean;
  rojo?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-gray-600">{titulo}</span>
      <span className={`text-right tabular-nums ${fuerte ? "font-semibold" : ""} ${rojo ? "text-red-600" : ""}`}>
        {money(usd, 2)}
        {origen && <span className="block text-xs font-normal text-gray-400">{origen}</span>}
      </span>
    </div>
  );
}
