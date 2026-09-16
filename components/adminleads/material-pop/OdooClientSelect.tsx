"use client";

import { useEffect, useState } from "react";
import { Building, Check, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface OdooClient {
  id: number;
  name: string;
  vat: string;
  email: string;
  phone: string;
}

function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function OdooClientSelect({
  value,
  onChange,
}: {
  value: OdooClient | null;
  onChange: (client: OdooClient | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<OdooClient[]>([]);
  const [loading, setLoading] = useState(false);
  const debouncedQuery = useDebounced(query, 350);

  useEffect(() => {
    if (!open) return;
    if (debouncedQuery.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const controller = new AbortController();
    fetch(
      `/api/adminleads/material-pop/clients?q=${encodeURIComponent(debouncedQuery)}&limit=20`,
      { signal: controller.signal },
    )
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        setResults(json.clients || []);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [open, debouncedQuery]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setQuery("");
        }}
        className="flex min-h-10 w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm transition-colors hover:border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-100"
      >
        {value ? (
          <span className="flex min-w-0 items-center gap-2">
            <Building className="h-4 w-4 shrink-0 text-violet-600" />
            <span className="truncate font-medium text-slate-800">
              {value.name}
            </span>
            {value.vat && (
              <span className="shrink-0 text-xs text-slate-400">{value.vat}</span>
            )}
          </span>
        ) : (
          <span className="text-slate-400">Buscar cliente en Odoo…</span>
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
                  placeholder="Escribe al menos 2 letras…"
                  className="h-8 w-full rounded-md border border-slate-200 pl-8 pr-2 text-sm focus:border-violet-300 focus:outline-none"
                />
              </div>
            </div>
            <ul className="max-h-60 overflow-auto p-1">
              {loading && (
                <li className="flex items-center justify-center gap-2 px-3 py-3 text-xs text-slate-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Buscando…
                </li>
              )}
              {!loading && query.trim().length < 2 && (
                <li className="px-3 py-2 text-sm text-slate-400">
                  Escribe para buscar clientes
                </li>
              )}
              {!loading && results.length === 0 && query.trim().length >= 2 && (
                <li className="px-3 py-2 text-sm text-slate-400">
                  Sin resultados
                </li>
              )}
              {results.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(c);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-violet-50",
                      value?.id === c.id && "bg-violet-50",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-800">
                        {c.name}
                      </span>
                      <span className="block truncate text-xs text-slate-400">
                        {c.vat || c.phone || c.email || "—"}
                      </span>
                    </span>
                    {value?.id === c.id && (
                      <Check className="h-4 w-4 shrink-0 text-violet-600" />
                    )}
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
