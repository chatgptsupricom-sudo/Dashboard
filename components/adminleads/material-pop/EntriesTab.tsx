"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeftRight,
  Loader2,
  PackagePlus,
  SlidersHorizontal,
} from "lucide-react";
import { MovementLines, lineaVacia, type MovementLine } from "./MovementLines";
import type { PopProduct } from "@/lib/adminleads/material-pop/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Mode = "entry" | "transfer" | "adjustment";

const PRESET_ENTRY_REASONS = ["Compra", "Devolución", "Otro"];
const PRESET_ADJUST_REASONS = ["Inventario físico", "Otro"];

const MODES: { id: Mode; label: string; icon: React.ElementType }[] = [
  { id: "entry", label: "Entrada", icon: PackagePlus },
  { id: "transfer", label: "Traslado", icon: ArrowLeftRight },
  { id: "adjustment", label: "Ajuste", icon: SlidersHorizontal },
];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function EntriesTab({
  products,
  onDone,
  onGoToCatalog,
}: {
  products: PopProduct[];
  onDone: () => Promise<void> | void;
  onGoToCatalog: () => void;
}) {
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>("entry");

  const [lines, setLines] = useState<MovementLine[]>([lineaVacia()]);
  const [location, setLocation] = useState<"office" | "warehouse">("office");
  const [source, setSource] = useState<"office" | "warehouse">("office");
  const [target, setTarget] = useState<"office" | "warehouse">("warehouse");
  const [reason, setReason] = useState("Compra");
  const [customReason, setCustomReason] = useState("");
  const [movementDate, setMovementDate] = useState(today());
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
  }, [mode]);

  async function submit() {
    setError(null);
    const conProducto = lines.filter((l) => l.productId !== null);
    if (conProducto.length === 0) {
      setError("Selecciona un producto");
      return;
    }

    // En ajuste la cantidad es la real contada y puede ser 0; en el resto tiene
    // que ser mayor que 0.
    const esAjuste = mode === "adjustment";
    const items = conProducto.map((l) => {
      const q = Number(l.quantity);
      return { productId: l.productId, cantidad: q };
    });
    if (items.some((it) => !Number.isFinite(it.cantidad) || (esAjuste ? it.cantidad < 0 : it.cantidad <= 0))) {
      setError(esAjuste ? "Cantidad real inválida" : "Cantidad inválida");
      return;
    }

    const body: any = {
      type: mode,
      items: items.map((it) =>
        esAjuste
          ? { productId: it.productId, newQuantity: it.cantidad }
          : { productId: it.productId, quantity: it.cantidad },
      ),
      movementDate,
      notes: notes.trim() || null,
    };

    if (mode === "transfer") {
      body.sourceLocation = source;
      body.targetLocation = target;
    } else {
      body.location = location;
      body.reasonType = reason === "Otro" && customReason.trim()
        ? customReason.trim()
        : reason.toLowerCase().replace(/\s+/g, "_");
      body.reasonCustom = reason === "Otro" ? customReason.trim() || null : null;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/adminleads/material-pop/movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error || "No se pudo registrar");
        return;
      }

      toast({
        title: mode === "entry" ? "Entrada registrada" : mode === "transfer" ? "Traslado registrado" : "Ajuste registrado",
        description: "El stock se actualizó correctamente.",
      });

      setNotes("");
      setMovementDate(today());
      setLines([lineaVacia()]);
      await onDone();
    } catch (e: any) {
      setError(e.message || "Error de conexión");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      {products.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-200 py-16 text-center">
          <PackagePlus className="h-8 w-8 text-slate-300" />
          <div>
            <p className="text-sm font-medium text-slate-600">
              No hay productos en el catálogo
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Crea un producto antes de registrar movimientos.
            </p>
          </div>
          <Button size="sm" onClick={onGoToCatalog}>
            Ir al catálogo
          </Button>
        </div>
      ) : (
        <>
          {/* Selector de modo */}
          <div className="grid grid-cols-3 gap-2">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-sm font-medium transition-colors",
                  mode === m.id
                    ? "border-violet-300 bg-violet-50 text-violet-700"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                )}
              >
                <m.icon className="h-5 w-5" />
                {m.label}
              </button>
            ))}
          </div>

          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
            <MovementLines
              products={products}
              lines={lines}
              onChange={setLines}
              quantityLabel={mode === "adjustment" ? "Real" : "Cantidad"}
            />

            {mode === "entry" && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>Ubicación destino</Label>
                    <select
                      value={location}
                      onChange={(e) => setLocation(e.target.value as any)}
                      className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                    >
                      <option value="office">Oficina</option>
                      <option value="warehouse">Almacén</option>
                    </select>
                  </div>
                  <div>
                    <Label>Tipo de entrada</Label>
                    <select
                      value={reason}
                      onChange={(e) => {
                        setReason(e.target.value);
                        setCustomReason("");
                      }}
                      className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                    >
                      {PRESET_ENTRY_REASONS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {reason === "Otro" && (
                  <div>
                    <Label>Motivo personalizado</Label>
                    <Input
                      value={customReason}
                      onChange={(e) => setCustomReason(e.target.value)}
                      placeholder="Ej: Devolución por evento, cortesía..."
                      className="mt-1.5"
                    />
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>Fecha</Label>
                    <Input
                      type="date"
                      max={today()}
                      value={movementDate}
                      onChange={(e) => setMovementDate(e.target.value)}
                      className="mt-1.5"
                    />
                  </div>
                </div>
              </>
            )}

            {mode === "transfer" && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>Desde</Label>
                    <select
                      value={source}
                      onChange={(e) => setSource(e.target.value as any)}
                      className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                    >
                      <option value="office">Oficina</option>
                      <option value="warehouse">Almacén</option>
                    </select>
                  </div>
                  <div>
                    <Label>Hacia</Label>
                    <select
                      value={target}
                      onChange={(e) => setTarget(e.target.value as any)}
                      className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                    >
                      <option value="office">Oficina</option>
                      <option value="warehouse">Almacén</option>
                    </select>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>Fecha</Label>
                    <Input
                      type="date"
                      max={today()}
                      value={movementDate}
                      onChange={(e) => setMovementDate(e.target.value)}
                      className="mt-1.5"
                    />
                  </div>
                </div>
              </>
            )}

            {mode === "adjustment" && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>Ubicación</Label>
                    <select
                      value={location}
                      onChange={(e) => setLocation(e.target.value as any)}
                      className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                    >
                      <option value="office">Oficina</option>
                      <option value="warehouse">Almacén</option>
                    </select>
                  </div>
                  <div>
                    <Label>Tipo de ajuste</Label>
                    <select
                      value={reason}
                      onChange={(e) => {
                        setReason(e.target.value);
                        setCustomReason("");
                      }}
                      className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                    >
                      {PRESET_ADJUST_REASONS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {reason === "Otro" && (
                  <div>
                    <Label>Motivo personalizado</Label>
                    <Input
                      value={customReason}
                      onChange={(e) => setCustomReason(e.target.value)}
                      placeholder="Ej: Corrección de registro..."
                      className="mt-1.5"
                    />
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>Fecha</Label>
                    <Input
                      type="date"
                      max={today()}
                      value={movementDate}
                      onChange={(e) => setMovementDate(e.target.value)}
                      className="mt-1.5"
                    />
                  </div>
                </div>
                <p className="text-xs text-slate-400">
                  La cantidad de cada fila es la real contada en{" "}
                  {location === "office" ? "Oficina" : "Almacén"}: el sistema calcula la
                  diferencia contra el stock que se muestra bajo cada producto.
                </p>
              </>
            )}

            <div>
              <Label>Notas</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Detalles opcionales del movimiento"
                className="mt-1.5"
                rows={2}
              />
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            <Button
              type="button"
              onClick={submit}
              disabled={saving}
              className="w-full"
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === "entry"
                ? "Registrar entrada"
                : mode === "transfer"
                  ? "Realizar traslado"
                  : "Aplicar ajuste"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
