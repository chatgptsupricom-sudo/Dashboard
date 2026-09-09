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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  calcularLineaTotal,
  calcularTotal,
  fmtMoneda,
  type OrdenLinea,
  type ProductoOdoo,
} from "@/lib/compras/ordenes-types";

interface Props {
  lines: OrdenLinea[];
  onChange: (lines: OrdenLinea[]) => void;
  currency?: string;
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

export function OrdenLineasEditor({ lines, onChange, currency = "USD", disabled }: Props) {
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

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {!disabled && <BuscadorProducto onSelect={addProducto} />}
        {!disabled && (
          <Button type="button" variant="outline" size="sm" onClick={addManual}>
            <Plus className="h-4 w-4 mr-1" /> Línea manual
          </Button>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[110px]">Código</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead className="w-[90px] text-right">Cant.</TableHead>
              <TableHead className="w-[130px] text-right">Precio unit.</TableHead>
              <TableHead className="w-[130px] text-right">Total</TableHead>
              {!disabled && <TableHead className="w-[44px]" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={disabled ? 5 : 6}
                  className="text-center text-sm text-slate-400 py-6"
                >
                  Sin líneas. Busca un producto o agrega una línea manual.
                </TableCell>
              </TableRow>
            )}
            {lines.map((l, i) => (
              <TableRow key={i}>
                <TableCell>
                  <Input
                    value={l.product_code ?? ""}
                    disabled={disabled}
                    onChange={(e) => update(i, { product_code: e.target.value })}
                    className="h-8"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={l.description}
                    disabled={disabled}
                    onChange={(e) => update(i, { description: e.target.value })}
                    className="h-8"
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    value={l.quantity}
                    disabled={disabled}
                    onChange={(e) => update(i, { quantity: Number(e.target.value) })}
                    className="h-8 text-right"
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    value={l.unit_price}
                    disabled={disabled}
                    onChange={(e) => update(i, { unit_price: Number(e.target.value) })}
                    className="h-8 text-right"
                  />
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {fmtMoneda(calcularLineaTotal(l), currency)}
                </TableCell>
                {!disabled && (
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-slate-400 hover:text-red-600"
                      onClick={() => remove(i)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex justify-end text-sm font-semibold">
        Total: <span className="ml-2 tabular-nums">{fmtMoneda(calcularTotal(lines), currency)}</span>
      </div>
    </div>
  );
}

function BuscadorProducto({ onSelect }: { onSelect: (p: ProductoOdoo) => void }) {
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
        const r = await fetch(`/api/compras/ordenes/productos?q=${encodeURIComponent(q)}`);
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
  }, [q, open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Search className="h-4 w-4 mr-1" /> Buscar producto
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[420px]" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Código o nombre del producto…"
            value={q}
            onValueChange={setQ}
          />
          <CommandList>
            {loading && (
              <div className="flex items-center justify-center py-6 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Buscando en Odoo…
              </div>
            )}
            {!loading && q.trim().length >= 2 && items.length === 0 && (
              <CommandEmpty>Sin resultados.</CommandEmpty>
            )}
            {!loading && (
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
                  >
                    <div className="flex flex-col">
                      <span className="text-sm">{p.name}</span>
                      <span className="text-xs text-slate-400">
                        {p.default_code || "sin código"} · {fmtMoneda(Number(p.standard_price || 0))}
                      </span>
                    </div>
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
