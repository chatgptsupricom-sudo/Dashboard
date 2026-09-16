"use client";

import { useMemo, useState } from "react";
import { Building2, Check, Search, Warehouse } from "lucide-react";
import type { PopProduct } from "@/lib/adminleads/material-pop/types";
import { cn } from "@/lib/utils";

export function ProductSelect({
  products,
  value,
  onChange,
}: {
  products: PopProduct[];
  value: number | null;
  onChange: (id: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = products.find((p) => p.id === value) || null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q),
    );
  }, [products, query]);

  return (
    <div className="relative">
      {/* Botón / campo seleccionado */}
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setQuery("");
        }}
        className="flex min-h-10 w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm transition-colors hover:border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-100"
      >
        {selected ? (
          <span className="flex items-center gap-2">
            <span className="rounded bg-violet-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-violet-700">
              {selected.code}
            </span>
            <span className="truncate font-medium text-slate-800">
              {selected.name}
            </span>
          </span>
        ) : (
          <span className="text-slate-400">Selecciona un producto…</span>
        )}
        <Search className="h-4 w-4 shrink-0 text-slate-400" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
            <div className="border-b border-slate-100 p-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar producto o SKU…"
                  className="h-8 w-full rounded-md border border-slate-200 pl-8 pr-2 text-sm focus:border-violet-300 focus:outline-none"
                />
              </div>
            </div>
            <ul className="max-h-60 overflow-auto p-1">
              {filtered.length === 0 && (
                <li className="px-3 py-2 text-sm text-slate-400">
                  Sin resultados
                </li>
              )}
              {filtered.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(p.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-violet-50",
                      value === p.id && "bg-violet-50",
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-600">
                        {p.code}
                      </span>
                      <span className="truncate font-medium text-slate-800">
                        {p.name}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-slate-500">
                      <span className="flex items-center gap-0.5">
                        <Building2 className="h-3 w-3" /> {p.stock_office}
                      </span>
                      <span className="flex items-center gap-0.5">
                        <Warehouse className="h-3 w-3" /> {p.stock_warehouse}
                      </span>
                      {value === p.id && (
                        <Check className="h-4 w-4 text-violet-600" />
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
