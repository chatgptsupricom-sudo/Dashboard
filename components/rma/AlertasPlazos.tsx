"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { AlarmClock, ChevronDown, ChevronRight, ChevronUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { colorEstado, etiquetaEstado } from "@/components/rma/estados";
import { PlazoBadge } from "@/components/rma/PlazoBadge";
import type { CasoConPlazo, ResumenPlazos } from "@/lib/rma/plazosCasos";

/**
 * Alertas de plazos del taller (lib/rma/plazos.ts): diagnóstico de más de 48
 * horas hábiles, equipos que llegan al 7.º día hábil en las instalaciones y
 * tickets cuyo equipo no llega. Se calcula al abrir la pantalla y se refresca
 * solo; cerrarla la oculta hasta el próximo refresco con algo nuevo.
 */

const REFRESCO_MS = 5 * 60_000;

export function AlertasPlazos() {
  const t = useTranslations("rma");
  const params = useParams();
  const locale = (params?.locale as string) || "es";
  const [casos, setCasos] = useState<CasoConPlazo[]>([]);
  const [resumen, setResumen] = useState<ResumenPlazos | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [cerradoCon, setCerradoCon] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    const cargar = () =>
      fetch("/api/rma/plazos?alertas=1")
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (!vigente || !j?.success) return;
          setCasos(j.casos || []);
          setResumen(j.resumen || null);
        })
        .catch(() => {});
    cargar();
    const id = setInterval(cargar, REFRESCO_MS);
    return () => {
      vigente = false;
      clearInterval(id);
    };
  }, []);

  // Firma de lo que se ve: si cambia (otro caso vence), el aviso vuelve.
  const firma = casos.map((c) => `${c.id}:${c.plazo.nivel}`).join(",");
  if (!resumen || !casos.length || cerradoCon === firma) return null;

  const vencidos = casos.filter((c) => c.plazo.nivel === "vencido");
  const avisos = casos.filter((c) => c.plazo.nivel === "aviso");
  const lista = [...vencidos, ...avisos];
  const hayVencidos = vencidos.length > 0;

  const tono = hayVencidos
    ? { caja: "border-red-200 bg-red-50", icono: "bg-red-100 text-red-600", texto: "text-red-900", sub: "text-red-700", hover: "hover:bg-red-100" }
    : { caja: "border-amber-200 bg-amber-50", icono: "bg-amber-100 text-amber-600", texto: "text-amber-900", sub: "text-amber-700", hover: "hover:bg-amber-100" };

  const partes = [
    resumen.diagnosticoVencido ? t("alertas_diagnostico_vencido", { n: resumen.diagnosticoVencido }) : null,
    resumen.tallerVencido ? t("alertas_taller_vencido", { n: resumen.tallerVencido }) : null,
    resumen.porLlegarVencido ? t("alertas_por_llegar_vencido", { n: resumen.porLlegarVencido }) : null,
    avisos.length ? t("alertas_por_vencer", { n: avisos.length }) : null,
  ].filter(Boolean);

  return (
    <div className={`rounded-3xl border p-4 shadow-sm ${tono.caja}`}>
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-xl shrink-0 ${tono.icono}`}>
          <AlarmClock className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`font-semibold ${tono.texto}`}>
            {hayVencidos ? t("alertas_titulo_vencidos", { n: vencidos.length }) : t("alertas_titulo_avisos", { n: avisos.length })}
          </p>
          <p className={`text-sm mt-0.5 ${tono.sub}`}>{partes.join(" · ")}</p>

          {abierto && (
            <ul className={`mt-3 space-y-1.5 text-sm ${tono.texto}`}>
              {lista.map((c) => (
                <li key={c.id} className="border-t border-black/5 pt-1.5">
                  <Link
                    href={`/${locale}/rma/casos/${c.id}`}
                    className="flex flex-wrap items-center gap-x-2 gap-y-1 hover:underline"
                  >
                    <span className="font-mono text-xs font-bold">#{c.case_number}</span>
                    <span className="font-medium">{c.client_name}</span>
                    <span className={`truncate max-w-[220px] ${tono.sub}`}>{c.producto}</span>
                    <Badge className={`${colorEstado[c.status] || ""} border text-[10px]`}>
                      {etiquetaEstado[c.status] || c.status}
                    </Badge>
                    <span className="ml-auto inline-flex items-center gap-1">
                      <PlazoBadge plazo={c.plazo} />
                      <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <Button
            variant="ghost"
            size="sm"
            className={`mt-2 -ml-2 h-8 ${tono.texto} ${tono.hover}`}
            onClick={() => setAbierto((v) => !v)}
          >
            {abierto ? <ChevronUp className="w-4 h-4 mr-1" /> : <ChevronDown className="w-4 h-4 mr-1" />}
            {abierto ? t("pendientes_alerta_ocultar") : t("pendientes_alerta_ver")}
          </Button>
        </div>
        <button
          type="button"
          onClick={() => setCerradoCon(firma)}
          aria-label={t("pendientes_alerta_cerrar")}
          className={`p-1 rounded-lg shrink-0 ${tono.sub} ${tono.hover}`}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
