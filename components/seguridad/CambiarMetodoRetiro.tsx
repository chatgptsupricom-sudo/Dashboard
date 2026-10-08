"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  borradorDe,
  cuerpoConAutorizacion,
  errorBorrador,
  MetodoRetiroCampos,
  type Borrador,
  type Opcion,
} from "@/components/ventas/MetodoRetiroCampos";
import type { FilaMetodo } from "@/lib/ventas/metodoRetiroTipos";
import { Loader2, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

/**
 * Botón + diálogo con el que Almacén cambia el método de retiro de un pedido
 * cuando el cliente avisa que lo recibe de otra forma
 * (PUT /api/seguridad/mercancia/metodo-retiro). Sirve antes de registrar el
 * egreso y mientras el egreso siga en manos de Almacén.
 */
export function CambiarMetodoRetiro({
  pickingId,
  actual,
  onGuardado,
  className = "",
}: {
  pickingId: number;
  /** El método que se muestra en pantalla; al abrir se relee de la API. */
  actual: FilaMetodo | null;
  onGuardado: (metodo: FilaMetodo) => void;
  className?: string;
}) {
  const t = useTranslations("metodoRetiro");
  const [abierto, setAbierto] = useState(false);
  const [rutas, setRutas] = useState<Opcion[] | null>(null);
  const [agencias, setAgencias] = useState<Opcion[]>([]);
  const [borrador, setBorrador] = useState<Borrador>(() => borradorDe(actual, [], null));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  // Cada vez que se abre se relee el método actual: puede haberlo cambiado
  // el vendedor u otro almacenista.
  const abrir = async () => {
    setError("");
    setRutas(null);
    setAbierto(true);
    let ags: Opcion[] = [];
    let vigente = actual;
    try {
      const r = await fetch(`/api/seguridad/mercancia/metodo-retiro?odoo_picking_id=${pickingId}`);
      const j = await r.json();
      if (!j.success) throw new Error(j.error);
      setRutas(j.rutas || []);
      setAgencias(j.agencias || []);
      ags = j.agencias || [];
      vigente = j.metodo || actual;
    } catch (e: any) {
      setRutas([]);
      setError(e?.message || t("error_cargar"));
    }
    // Las agencias ya vienen de la sucursal: companyId no hace falta.
    setBorrador(borradorDe(vigente, ags.map((a) => ({ ...a, cids: undefined })), undefined));
  };

  const guardar = async () => {
    const falta = errorBorrador(borrador);
    if (falta) return setError(t(falta));
    setGuardando(true);
    setError("");
    try {
      // Transporte externo: la foto nueva de la autorización se sube primero.
      const cuerpo = await cuerpoConAutorizacion(borrador, t("error_guardar"));
      const r = await fetch("/api/seguridad/mercancia/metodo-retiro", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ odoo_picking_id: pickingId, ...cuerpo }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.success) throw new Error(j.error || t("error_guardar"));
      onGuardado(j.metodo);
      setAbierto(false);
    } catch (e: any) {
      setError(e?.message || t("error_guardar"));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={abrir} className={`rounded-lg bg-white ${className}`}>
        <Pencil className="w-3.5 h-3.5 mr-1.5" />
        {t("cambiar")}
      </Button>
      <Dialog open={abierto} onOpenChange={(v) => !guardando && setAbierto(v)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("cambiar_titulo")}</DialogTitle>
            <DialogDescription>{t("cambiar_desc_almacen")}</DialogDescription>
          </DialogHeader>
          {rutas === null ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : (
            <MetodoRetiroCampos
              valor={borrador}
              onChange={(c) => setBorrador((b) => ({ ...b, ...c }))}
              rutas={rutas}
              agencias={agencias}
              columnas="grid-cols-2"
            />
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => setAbierto(false)} disabled={guardando}>
              {t("cancelar")}
            </Button>
            <Button
              type="button"
              onClick={guardar}
              disabled={guardando || rutas === null || !borrador.metodo}
              className="bg-violet-600 hover:bg-violet-700 text-white"
            >
              {guardando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t("guardar")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
