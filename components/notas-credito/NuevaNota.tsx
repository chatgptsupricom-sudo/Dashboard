"use client";

import { FacturaBuscador, type FacturaElegida } from "@/components/notas-credito/FacturaBuscador";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatoMonto, NOMBRE_SEDE } from "@/lib/notas-credito/tipos";
import { Loader2 } from "lucide-react";
import { useState } from "react";

/**
 * Nota de crédito que no viene de RMA (descuento, error de precio, mercancía
 * no retirada…). La crea quien hace la nota (o el SuperAdmin) y pasa por la preaprobación de IT.
 */
export function NuevaNota({ sedes, onCerrar, onCreada }: { sedes: number[]; onCerrar: () => void; onCreada: (id: number) => void }) {
  const [sede, setSede] = useState(sedes[0]);
  const [factura, setFactura] = useState<FacturaElegida | null>(null);
  const [monto, setMonto] = useState("");
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  const libre = factura ? Math.round((factura.total - factura.acreditado) * 100) / 100 : null;

  const enviar = async () => {
    setEnviando(true);
    setError("");
    try {
      const r = await fetch("/api/notas-credito", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: sede, factura_id: factura?.id, monto: Number(monto), motivo }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "No se pudo crear");
      onCreada(j.id);
    } catch (e: any) {
      setError(e?.message || "No se pudo crear");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva nota de crédito</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <p className="text-slate-500">Para lo que no es un equipo de RMA. Le llega a quien aprueba.</p>
          {sedes.length > 1 && (
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-600">Sede</span>
              <select
                className="w-full rounded-md border px-3 py-2"
                value={sede}
                onChange={(e) => {
                  setSede(Number(e.target.value));
                  setFactura(null);
                }}
              >
                {sedes.map((s) => (
                  <option key={s} value={s}>
                    {NOMBRE_SEDE[s] || s}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="space-y-1">
            <span className="text-xs font-medium text-slate-600">Factura</span>
            <FacturaBuscador companyId={sede} elegida={factura} onElegir={setFactura} />
          </div>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-600">Monto a acreditar (con impuestos)</span>
            <Input type="number" step="0.01" min="0" value={monto} onChange={(e) => setMonto(e.target.value)} />
            {libre != null && (
              <span className="text-xs text-slate-500">
                Queda por acreditar {formatoMonto(libre, factura!.moneda)}.{" "}
                <button type="button" className="text-blue-700 hover:underline" onClick={() => setMonto(String(libre))}>
                  Usar todo
                </button>
              </span>
            )}
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-600">Motivo</span>
            <Textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: error en precio, el cliente no retiró la mercancía…" />
          </label>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onCerrar} disabled={enviando}>
              Cancelar
            </Button>
            <Button onClick={enviar} disabled={enviando || !factura || !(Number(monto) > 0) || motivo.trim().length < 10}>
              {enviando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enviar a aprobación
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
