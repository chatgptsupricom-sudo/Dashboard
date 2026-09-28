"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, ChevronDown, ChevronUp, Loader2, PenLine } from "lucide-react";
import FirmasActa from "@/components/seguridad/FirmasActa";

/**
 * Actas de RMA (ingresos y despachos) para que un rol firme la suya desde su
 * propio panel: Almacén (opcional) en la suya y RMA (técnico) en el caso.
 * Seguridad firma la suya y la del cliente en su propia pantalla del acta.
 */
type Acta = {
  tipo: "ingreso" | "despacho";
  id: number;
  fecha: string;
  cliente: string | null;
  hardware: string | null;
  guia: string | null;
  case_number: string | null;
  firmado: boolean;
};

export default function ActasPorFirmar({
  rol,
  rmaCaseId,
  compacto = false,
}: {
  rol: "almacen" | "tecnico";
  /** Solo las actas de este caso (panel de RMA). Sin él, las recientes. */
  rmaCaseId?: number;
  /** Sin el título ni la ayuda (para meterlo dentro de otra tarjeta). */
  compacto?: boolean;
}) {
  const t = useTranslations("seguridad.actas_firmar");
  const [actas, setActas] = useState<Acta[] | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);

  const cargar = useCallback(() => {
    const q = new URLSearchParams({ rol });
    if (rmaCaseId) q.set("rma_case_id", String(rmaCaseId));
    fetch(`/api/seguridad/firmas/actas?${q}`)
      .then((r) => (r.ok ? r.json() : { actas: [] }))
      .then((j) => setActas(j.actas || []))
      .catch(() => setActas([]));
  }, [rol, rmaCaseId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (actas === null) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {!compacto && <p className="text-xs text-slate-500">{t(`ayuda.${rol}`)}</p>}
      {actas.length === 0 ? (
        <p className="text-sm text-slate-500 py-4 text-center">{t("vacio")}</p>
      ) : (
        <ul className="space-y-2">
          {actas.map((a) => {
            const clave = `${a.tipo}-${a.id}`;
            const abiertaEsta = abierta === clave;
            return (
              <li key={clave} className="border border-slate-200 rounded-[10px] bg-white">
                <button
                  type="button"
                  onClick={() => setAbierta(abiertaEsta ? null : clave)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
                >
                  {a.firmado ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <PenLine className="w-4 h-4 text-amber-600 shrink-0" />
                  )}
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-slate-800 truncate">
                      {t(`tipo.${a.tipo}`)} · {a.cliente || "—"}
                    </span>
                    <span className="block text-[11px] text-slate-500 truncate">
                      {[
                        a.guia ? t("guia", { n: a.guia }) : null,
                        a.case_number ? `#${a.case_number}` : null,
                        a.hardware,
                        String(a.fecha).slice(0, 10),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                      a.firmado ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {a.firmado ? t("firmada") : t("por_firmar")}
                  </span>
                  {abiertaEsta ? (
                    <ChevronUp className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  )}
                </button>
                {abiertaEsta && (
                  <div className="px-3 pb-3">
                    <FirmasActa
                      tipo={a.tipo}
                      actaId={a.id}
                      nombresSugeridos={{ cliente: a.cliente || undefined }}
                      puedeFirmar={[rol]}
                      opcionales={["almacen"]}
                    />
                    <button
                      type="button"
                      onClick={cargar}
                      className="mt-2 text-xs font-semibold text-slate-500 hover:text-slate-800"
                    >
                      {t("actualizar")}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
