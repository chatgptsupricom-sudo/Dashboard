"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2, PackageSearch, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  calcularLineaTotal,
  calcularTotal,
  contarUnidades,
  fmtMoneda,
  type OrdenLinea,
  type ProductoOdoo,
} from "@/lib/compras/ordenes-types";

interface Props {
  lines: OrdenLinea[];
  onChange: (lines: OrdenLinea[]) => void;
  currency?: string;
  sede?: string;
  disabled?: boolean;
}

function nuevaLinea(): OrdenLinea {
  return {
    product_odoo_id: null,
    product_code: "",
    description: "",
    quantity: 1,
    unit_price: 0,
  };
}

const microLabel =
  "text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500";

export function OrdenLineasEditor({ lines, onChange, currency = "USD", sede, disabled }: Props) {
  const update = (i: number, patch: Partial<OrdenLinea>) => {
    onChange(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  };
  const remove = (i: number) => onChange(lines.filter((_, idx) => idx !== i));
  const addManual = () => onChange([...lines, nuevaLinea()]);

  const addProducto = (p: ProductoOdoo) => {
    onChange([
      ...lines,
      {
        product_odoo_id: p.id,
        product_code: p.default_code ?? "",
        description: p.name,
        quantity: 1,
        unit_price: Number(p.standard_price || 0),
      },
    ]);
  };

  const total = calcularTotal(lines);
  const unidades = contarUnidades(lines);

  return (
    <div className="space-y-3">
      {!disabled && (
        <div className="flex flex-wrap items-center gap-2">
          <BuscadorProducto onSelect={addProducto} sede={sede} />
          <Button type="button" variant="outline" size="sm" onClick={addManual}>
            <Plus className="h-4 w-4 mr-1" /> Línea manual
          </Button>
        </div>
      )}

      {lines.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 py-10 px-4 text-center">
          <PackageSearch className="h-8 w-8 mx-auto text-slate-300 dark:text-slate-600" />
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {disabled
              ? "Esta orden no tiene líneas."
              : "Busca un producto en Odoo o agrega una línea manual."}
          </p>
        </div>
      ) : disabled ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
          {lines.map((l, i) => (
            <div
              key={i}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-slate-100 p-3 last:border-0 dark:border-slate-800/70"
            >
              <span className="font-mono text-xs text-slate-400">
                {l.product_code || "—"}
              </span>
              <span className="min-w-0 flex-1 text-sm text-slate-800 dark:text-slate-200">
                {l.description}
              </span>
              <span className="text-xs tabular-nums text-slate-500">
                {Number(l.quantity).toLocaleString("es")} ×{" "}
                {fmtMoneda(Number(l.unit_price), currency)}
              </span>
              <span className="w-24 text-right text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                {fmtMoneda(calcularLineaTotal(l), currency)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {lines.map((l, i) => (
            <div
              key={i}
              className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900/40"
            >
              <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 sm:grid-cols-[8rem_minmax(0,1fr)_4.5rem_7rem_auto] sm:items-end">
                <label className="col-span-2 space-y-1 sm:col-span-1">
                  <span className={microLabel}>Código</span>
                  <Input
                    value={l.product_code ?? ""}
                    disabled={disabled}
                    onChange={(e) => update(i, { product_code: e.target.value })}
                    placeholder="—"
                    className="h-9"
                  />
                </label>

                <label className="col-span-2 space-y-1 sm:col-span-1">
                  <span className={microLabel}>Descripción</span>
                  <Input
                    value={l.description}
                    disabled={disabled}
                    onChange={(e) => update(i, { description: e.target.value })}
                    placeholder="Descripción del producto"
                    className="h-9"
                  />
                </label>

                <label className="space-y-1">
                  <span className={microLabel}>Cant.</span>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    value={l.quantity}
                    disabled={disabled}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) =>
                      update(i, { quantity: e.target.value === "" ? 0 : Number(e.target.value) })
                    }
                    className="h-9 text-right tabular-nums"
                  />
                </label>

                <label className="space-y-1">
                  <span className={microLabel}>Precio unit.</span>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    value={l.unit_price}
                    disabled={disabled}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) =>
                      update(i, { unit_price: e.target.value === "" ? 0 : Number(e.target.value) })
                    }
                    className="h-9 text-right tabular-nums"
                  />
                </label>

                <div className="col-span-2 flex items-center justify-between gap-3 border-t border-slate-100 pt-2 dark:border-slate-800 sm:col-span-1 sm:border-0 sm:pt-0 sm:justify-end">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 sm:hidden">
                    Total línea
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                      {fmtMoneda(calcularLineaTotal(l), currency)}
                    </span>
                    {!disabled && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Quitar línea"
                        className="h-8 w-8 shrink-0 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                        onClick={() => remove(i)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {lines.length > 0 && (
        <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-800/50">
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {lines.length} {lines.length === 1 ? "línea" : "líneas"} ·{" "}
            {unidades.toLocaleString("es")} und.
          </span>
          <span className="text-base font-black tabular-nums text-slate-900 dark:text-slate-100">
            {fmtMoneda(total, currency)}
          </span>
        </div>
      )}
    </div>
  );
}

function BuscadorProducto({
  onSelect,
  sede,
}: {
  onSelect: (p: ProductoOdoo) => void;
  sede?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [items, setItems] = useState<ProductoOdoo[]>([]);
  const [loading, setLoading] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    if (debounce.current) clearTimeout(debounce.current);
    if (q.trim().length < 2) {
      setItems([]);
      return;
    }
    debounce.current = setTimeout(async () => {
      setLoading(true);
      try {
        const sedeParam = sede ? `&sede=${encodeURIComponent(sede)}` : "";
        const r = await fetch(`/api/compras/ordenes/productos?q=${encodeURIComponent(q)}${sedeParam}`);
        const json = await r.json();
        setItems(json.success ? json.data : []);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [q, open, sede]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" size="sm">
          <Search className="h-4 w-4 mr-1" /> Buscar producto
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 w-[min(28rem,calc(100vw-2rem))]"
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Código o nombre del producto…"
            value={q}
            onValueChange={setQ}
          />
          <CommandList>
            {q.trim().length < 2 && !loading && (
              <p className="py-6 text-center text-sm text-slate-400">
                Escribe al menos 2 caracteres.
              </p>
            )}
            {loading && (
              <div className="flex items-center justify-center py-6 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Buscando en Odoo…
              </div>
            )}
            {!loading && q.trim().length >= 2 && items.length === 0 && (
              <CommandEmpty>Sin resultados para “{q}”.</CommandEmpty>
            )}
            {!loading && items.length > 0 && (
              <CommandGroup>
                {items.map((p) => (
                  <CommandItem
                    key={p.id}
                    value={String(p.id)}
                    onSelect={() => {
                      onSelect(p);
                      setOpen(false);
                      setQ("");
                    }}
                    className="flex flex-col items-start gap-0.5"
                  >
                    <span className="text-sm leading-tight">{p.name}</span>
                    <span className="text-xs text-slate-400">
                      {p.default_code || "sin código"} ·{" "}
                      {fmtMoneda(Number(p.standard_price || 0))}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
