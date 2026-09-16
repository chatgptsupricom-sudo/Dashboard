"use client";

import { useState } from "react";
import { CalendarX, Loader2, PackageMinus, UserRound } from "lucide-react";
import { ProductSelect } from "./ProductSelect";
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

  const [productId, setProductId] = useState<number | null>(null);
  const [location, setLocation] = useState<"office" | "warehouse">("office");
  const [useOtherLocation, setUseOtherLocation] = useState(false);
  const [quantity, setQuantity] = useState("");
  const [client, setClient] = useState<any>(null);
  const [destination, setDestination] = useState("");
  const [movementDate, setMovementDate] = useState(today());
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentProduct = products.find((p) => p.id === productId) || null;
  const allowsDecimal = Boolean(currentProduct?.uom_allows_decimal);
  const currentStock =
    currentProduct?.[location === "office" ? "stock_office" : "stock_warehouse"] ?? 0;

  async function submit() {
    setError(null);
    if (!productId) {
      setError("Selecciona un producto");
      return;
    }
    const q = Number(quantity);
    if (!Number.isFinite(q) || q <= 0) {
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
      productId,
      location,
      quantity: q,
      useOtherLocation,
      reasonType,
      movementDate,
      notes: notes.trim() || null,
    };

    if (kind === "cliente") {
      body.clientId = client.id;
      body.clientName = client.name;
      body.clientCids = null;
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
        description: "El stock se actualizó correctamente.",
      });

      setQuantity("");
      setDestination("");
      setClient(null);
      setUseOtherLocation(false);
      setNotes("");
      setMovementDate(today());
      setProductId(null);
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
            <div>
              <Label>Producto</Label>
              <div className="mt-1.5">
                <ProductSelect
                  products={products}
                  value={productId}
                  onChange={setProductId}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Ubicación de salida</Label>
                <select
                  value={location}
                  onChange={(e) => setLocation(e.target.value as any)}
                  className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                >
                  <option value="office">Oficina</option>
                  <option value="warehouse">Almacén</option>
                </select>
                {currentProduct && (
                  <p className="mt-1 text-xs text-slate-400">
                    Disponible:{" "}
                    <strong>
                      {location === "office"
                        ? currentProduct.stock_office
                        : currentProduct.stock_warehouse}
                    </strong>
                  </p>
                )}
              </div>
              <div>
                <Label>Cantidad</Label>
                <Input
                  type="number"
                  min="0"
                   max={currentProduct?.stock_total}
                   step={allowsDecimal ? "0.01" : "1"}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="0"
                  className="mt-1.5"
                />
              </div>
            </div>

            {currentProduct && currentStock < Number(quantity || 0) && (
              <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <input
                  type="checkbox"
                  checked={useOtherLocation}
                  onChange={(e) => setUseOtherLocation(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  Usar también la otra ubicación para completar la salida.
                  Disponible total: {currentProduct.stock_total}.
                </span>
              </label>
            )}

            {kind === "cliente" && (
              <div>
                <Label>Cliente (Odoo)</Label>
                <div className="mt-1.5">
                  <OdooClientSelect value={client} onChange={setClient} />
                </div>
              </div>
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
          </div>
        </>
      )}
    </div>
  );
}
