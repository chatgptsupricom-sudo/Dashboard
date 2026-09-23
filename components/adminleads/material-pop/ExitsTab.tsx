"use client";

import { useState } from "react";
import { CalendarX, Loader2, PackageMinus, Printer, UserRound } from "lucide-react";
import { MovementLines, lineaVacia, type MovementLine } from "./MovementLines";
import { OdooClientSelect } from "./OdooClientSelect";
import type { PopProduct } from "@/lib/adminleads/material-pop/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type ExitKind = "cliente" | "interno" | "evento" | "campana";

const KINDS: { id: ExitKind; label: string; icon: React.ElementType }[] = [
  { id: "cliente", label: "Cliente", icon: UserRound },
  { id: "interno", label: "Uso interno", icon: PackageMinus },
  { id: "evento", label: "Evento", icon: CalendarX },
  { id: "campana", label: "Campaña", icon: CalendarX },
];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ExitsTab({
  products,
  onDone,
  onGoToCatalog,
}: {
  products: PopProduct[];
  onDone: () => Promise<void> | void;
  onGoToCatalog: () => void;
}) {
  const { toast } = useToast();
  const [kind, setKind] = useState<ExitKind>("cliente");

  const [lines, setLines] = useState<MovementLine[]>([lineaVacia()]);
  const [location, setLocation] = useState<"office" | "warehouse">("office");
  const [useOtherLocation, setUseOtherLocation] = useState(false);
  const [client, setClient] = useState<any>(null);
  const [ordenVenta, setOrdenVenta] = useState("");
  // Grupo de la última salida registrada: con él se pide su nota de entrega.
  const [ultimaSalida, setUltimaSalida] = useState<string | null>(null);
  const [destination, setDestination] = useState("");
  const [movementDate, setMovementDate] = useState(today());
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Alguna fila pide más de lo que hay en la ubicación elegida: ahí aparece la
  // opción de completar con la otra.
  const faltaEnUbicacion = lines.some((l) => {
    const producto = products.find((p) => p.id === l.productId);
    if (!producto) return false;
    const stock = location === "office" ? producto.stock_office : producto.stock_warehouse;
    return stock < Number(l.quantity || 0);
  });

  async function submit() {
    setError(null);
    const conProducto = lines.filter((l) => l.productId !== null);
    if (conProducto.length === 0) {
      setError("Selecciona un producto");
      return;
    }
    const items = conProducto.map((l) => ({
      productId: l.productId,
      quantity: Number(l.quantity),
    }));
    if (items.some((it) => !Number.isFinite(it.quantity) || it.quantity <= 0)) {
      setError("Cantidad inválida");
      return;
    }

    if (kind === "cliente" && !client) {
      setError("Selecciona un cliente de Odoo");
      return;
    }
    if (kind !== "cliente" && !destination.trim()) {
      setError("Indica el destino (" + KINDS.find((k) => k.id === kind)?.label.toLowerCase() + ")");
      return;
    }

    let reasonType = "cliente";
    if (kind === "interno") reasonType = "uso_interno";
    else if (kind === "evento") reasonType = "evento";
    else if (kind === "campana") reasonType = "campana";

    const body: any = {
      type: "exit",
      items,
      location,
      useOtherLocation,
      reasonType,
      movementDate,
      notes: notes.trim() || null,
    };

    if (kind === "cliente") {
      body.clientId = client.id;
      body.clientName = client.name;
      body.clientCids = null;
      body.odooOrderName = ordenVenta.trim() || null;
    } else {
      body.destination = destination.trim();
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
        setError(json?.error || "No se pudo registrar la salida");
        return;
      }

      toast({
        title: "Salida registrada",
        description:
          kind === "cliente"
            ? "El stock se actualizó. Ya puedes imprimir la nota de entrega."
            : "El stock se actualizó correctamente.",
      });
      setUltimaSalida(kind === "cliente" ? json?.movementGroupId || null : null);

      setLines([lineaVacia()]);
      setOrdenVenta("");
      setDestination("");
      setClient(null);
      setUseOtherLocation(false);
      setNotes("");
      setMovementDate(today());
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
          <PackageMinus className="h-8 w-8 text-slate-300" />
          <div>
            <p className="text-sm font-medium text-slate-600">
              No hay productos en el catálogo
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Crea un producto antes de registrar salidas.
            </p>
          </div>
          <Button size="sm" onClick={onGoToCatalog}>
            Ir al catálogo
          </Button>
        </div>
      ) : (
        <>
          {/* Selector de tipo de salida */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => setKind(k.id)}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-sm font-medium transition-colors",
                  kind === k.id
                    ? "border-violet-300 bg-violet-50 text-violet-700"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                )}
              >
                <k.icon className="h-5 w-5" />
                {k.label}
              </button>
            ))}
          </div>

          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
            <MovementLines products={products} lines={lines} onChange={setLines} />

            <div>
              <Label>Ubicación de salida</Label>
              <select
                value={location}
                onChange={(e) => setLocation(e.target.value as any)}
                className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm sm:w-56"
              >
                <option value="office">Oficina</option>
                <option value="warehouse">Almacén</option>
              </select>
            </div>

            {faltaEnUbicacion && (
              <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <input
                  type="checkbox"
                  checked={useOtherLocation}
                  onChange={(e) => setUseOtherLocation(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  Algún producto no alcanza en{" "}
                  {location === "office" ? "Oficina" : "Almacén"}. Usar también la otra
                  ubicación para completar la salida.
                </span>
              </label>
            )}

            {kind === "cliente" && (
              <>
                <div>
                  <Label>Cliente (Odoo)</Label>
                  <div className="mt-1.5">
                    <OdooClientSelect value={client} onChange={setClient} />
                  </div>
                </div>
                <div>
                  <Label>Orden de venta (Odoo)</Label>
                  <Input
                    value={ordenVenta}
                    onChange={(e) => setOrdenVenta(e.target.value)}
                    placeholder="Ej: S-05457 · opcional"
                    className="mt-1.5"
                  />
                  <p className="mt-1 text-xs text-slate-400">
                    Sale impresa en la nota de entrega.
                  </p>
                </div>
              </>
            )}

            {kind !== "cliente" && (
              <div>
                <Label>
                  Destino ({KINDS.find((k) => k.id === kind)?.label.toLowerCase()})
                </Label>
                <Input
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder={
                    kind === "evento"
                      ? "Ej: Lanzamiento en Centro Comercial La Granja"
                      : kind === "campana"
                        ? "Ej: Campaña Día de la Madre"
                        : "Ej: Material para la oficina"
                  }
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

            <div>
              <Label>Notas</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Detalles opcionales de la salida"
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
              Registrar salida
            </Button>

            {/* Queda a mano después de registrar: es el papel que firma quien
                recibe el material en el otro almacén. */}
            {ultimaSalida && (
              <Button
                type="button"
                variant="outline"
                className="w-full gap-2"
                onClick={() =>
                  window.open(
                    `/api/adminleads/material-pop/movements/nota?group=${ultimaSalida}`,
                    "_blank",
                  )
                }
              >
                <Printer className="h-4 w-4" />
                Nota de entrega de la última salida
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
