"use client";

import { Button } from "@/components/ui/button";
import { connectSocket } from "@/lib/socket-client";
import { useAuthStore } from "@/lib/stores/auth.store";
import { AlertTriangle, ChevronDown, ChevronUp, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

/**
 * Aviso al técnico de los equipos que llevan demasiado tiempo en el taller
 * sin despachar (issue #37).
 *
 * Se pinta como banner y no como toast a propósito. El cron corre una vez al
 * día a las 10:00: un toast que aparece y se va deja fuera a todo el que abra
 * el panel a las 10:05. El banner se arma al montar, preguntando por el estado
 * actual, y el socket solo lo actualiza si la alerta llega con el panel
 * abierto.
 *
 * El endpoint responde 403 a quien no sea del equipo técnico, así que en el
 * peor caso esto no muestra nada.
 */

interface IngresoPendiente {
  id: number;
  dias_en_taller: number;
  cliente_nombre: string;
  hardware: string | null;
  serial: string | null;
  case_number: string | null;
}

interface Alerta {
  count: number;
  oldest_days: number;
  dias_umbral: number;
  ingresos: IngresoPendiente[];
}

export function AlertaIngresosPendientes() {
  const t = useTranslations("rma");
  const { user } = useAuthStore();
  const [alerta, setAlerta] = useState<Alerta | null>(null);
  const [cerrado, setCerrado] = useState(false);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    let vigente = true;

    fetch("/api/seguridad/ingresos-pendientes-mios")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!vigente || !json?.success || json.count === 0) return;
        setAlerta({
          count: json.count,
          oldest_days: json.oldest_days,
          dias_umbral: json.dias_umbral,
          ingresos: json.ingresos,
        });
      })
      .catch(() => {});

    return () => {
      vigente = false;
    };
  }, []);

  useEffect(() => {
    const uid = (user as any)?.uid || (user as any)?.id;
    if (!uid) return;

    const socket = connectSocket(uid);
    const handler = (data: Alerta) => {
      setAlerta(data);
      // Una alerta nueva vuelve a mostrar el banner aunque lo hubieran cerrado:
      // si el cron volvió a avisar es porque el equipo sigue ahí.
      setCerrado(false);
    };
    socket.on("ingresos_pendientes_alerta", handler);
    return () => {
      socket.off("ingresos_pendientes_alerta", handler);
    };
  }, [user]);

  if (!alerta || cerrado || alerta.count === 0) return null;

  return (
    <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-amber-100 rounded-xl shrink-0">
          <AlertTriangle className="w-5 h-5 text-amber-600" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-amber-900">
            {t("pendientes_alerta_titulo", {
              count: alerta.count,
              dias: alerta.dias_umbral,
            })}
          </p>
          <p className="text-sm text-amber-700 mt-0.5">
            {t("pendientes_alerta_mas_antiguo", { dias: alerta.oldest_days })}
          </p>

          {abierto && (
            <ul className="mt-3 space-y-1.5 text-sm text-amber-900">
              {alerta.ingresos.map((i) => (
                <li
                  key={i.id}
                  className="flex flex-wrap items-baseline gap-x-2 border-t border-amber-200 pt-1.5"
                >
                  <span className="font-medium">{i.cliente_nombre}</span>
                  {i.hardware && <span className="text-amber-700">{i.hardware}</span>}
                  {i.serial && (
                    <span className="text-amber-600 font-mono text-xs">{i.serial}</span>
                  )}
                  {i.case_number && (
                    <span className="text-amber-600 text-xs">#{i.case_number}</span>
                  )}
                  <span className="ml-auto text-amber-700 whitespace-nowrap">
                    {t("pendientes_alerta_dias", { dias: i.dias_en_taller })}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <Button
            variant="ghost"
            size="sm"
            className="mt-2 -ml-2 h-8 text-amber-800 hover:bg-amber-100"
            onClick={() => setAbierto((v) => !v)}
          >
            {abierto ? (
              <ChevronUp className="w-4 h-4 mr-1" />
            ) : (
              <ChevronDown className="w-4 h-4 mr-1" />
            )}
            {abierto ? t("pendientes_alerta_ocultar") : t("pendientes_alerta_ver")}
          </Button>
        </div>

        <button
          type="button"
          onClick={() => setCerrado(true)}
          aria-label={t("pendientes_alerta_cerrar")}
          className="p-1 rounded-lg text-amber-600 hover:bg-amber-100 shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
