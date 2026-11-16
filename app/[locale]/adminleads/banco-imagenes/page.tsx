"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowUp, Search } from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth.store";
import { useToast } from "@/hooks/use-toast";
import { GaleriaFlyers, SOMBRA } from "@/components/banco-imagenes/GaleriaFlyers";
import { SubirFlyer, type Vinculo } from "@/components/banco-imagenes/SubirFlyer";
import { BandejaSolicitudes } from "@/components/banco-imagenes/BandejaSolicitudes";
import { cn } from "@/lib/utils";

// Suben flyers y atienden solicitudes (igual que ROLES_ESCRITURA de la API). BI y
// Marketing y Electrodomésticos usan esta pantalla solo para consultar.
const ESCRIBEN = ["superadmin", "adminleads", "gerente de operaciones", "diseñador"];

/** Banco de Flyers de AdminLeads (y Diseñador, SuperAdmin, BI): subir, revisar y atender lo que piden. */
export default function BancoImagenesPage() {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const escribe = ESCRIBEN.includes(String(user?.role || "").toLowerCase());

  const [busqueda, setBusqueda] = useState("");
  const [tab, setTab] = useState<"galeria" | "solicitudes">("galeria");
  const [subiendo, setSubiendo] = useState(false);
  const [vinculo, setVinculo] = useState<Vinculo | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [resumen, setResumen] = useState({ total: 0, nuevos: 0, sinPrecio: 0 });
  const [pendientes, setPendientes] = useState(0);

  useEffect(() => {
    fetch("/api/adminleads/banco-imagenes/categories")
      .then((r) => r.json())
      .then((d) => d.resumen && setResumen(d.resumen))
      .catch(() => {});
  }, [recarga]);

  useEffect(() => {
    if (!escribe) return;
    fetch("/api/adminleads/banco-imagenes/solicitudes?estado=pendiente")
      .then((r) => r.json())
      .then((d) => setPendientes(Number(d.pendientes) || 0))
      .catch(() => {});
  }, [escribe, recarga]);

  // El correo de solicitud nueva enlaza con ?tab=solicitudes.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "solicitudes") setTab("solicitudes");
  }, []);

  const onPendientes = useCallback((n: number) => setPendientes(n), []);

  const abrirSubida = (v: Vinculo | null) => {
    setVinculo(v);
    setSubiendo(true);
  };

  const stats: [number, string, boolean][] = [
    [resumen.total, "flyers en el banco", false],
    [resumen.nuevos, "nuevos esta semana", false],
    [resumen.sinPrecio, "sin precio en Odoo", true],
  ];
  if (escribe) stats.push([pendientes, "solicitudes por revisar", false]);

  return (
    <div className="grid gap-[18px] pb-20">
      <section className="relative grid min-w-0 gap-4 overflow-hidden rounded-[26px] bg-[linear-gradient(135deg,#1e3a8a_0%,#2563eb_55%,#60a5fa_100%)] p-6 text-white shadow-[0_18px_40px_rgba(37,99,235,.28)]">
        <span className="pointer-events-none absolute -right-28 -top-36 h-[380px] w-[380px] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,.22),transparent_70%)]" />
        <div className="relative flex flex-wrap items-start justify-between gap-3.5">
          <div>
            <h1 className="text-[22px] font-bold leading-tight tracking-tight sm:text-[28px]">Banco de Flyers</h1>
            <p className="mt-1 max-w-[56ch] opacity-90">
              {escribe
                ? "Sube, revisa y descarga los flyers que usan los vendedores, y atiende lo que te piden."
                : "Revisa y descarga los flyers que usan los vendedores."}
            </p>
          </div>
          {escribe && (
            <button
              type="button"
              onClick={() => abrirSubida(null)}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-[18px] font-bold text-blue-600 shadow-[0_8px_20px_rgba(15,23,42,.18)]"
            >
              <ArrowUp className="h-4 w-4" strokeWidth={2.4} />
              Subir flyer
            </button>
          )}
        </div>
        <div className="relative max-w-[640px]">
          <Search className="pointer-events-none absolute left-[18px] top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => {
              setBusqueda(e.target.value);
              setTab("galeria");
            }}
            placeholder="Buscar por código, modelo o marca"
            aria-label="Buscar flyer"
            autoComplete="off"
            className="h-[54px] w-full rounded-full border-0 bg-white pl-12 pr-[110px] text-[15px] text-slate-900 shadow-[0_8px_24px_rgba(15,23,42,.18)] outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
          />
          {busqueda && (
            <button
              type="button"
              onClick={() => setBusqueda("")}
              className="absolute right-2 top-1/2 h-[38px] -translate-y-1/2 rounded-full bg-blue-50 px-3.5 text-[13px] font-semibold text-blue-600"
            >
              Limpiar
            </button>
          )}
        </div>
        <div className="relative flex flex-wrap gap-2.5">
          {stats.map(([n, t, aviso]) => (
            <div
              key={t}
              className={cn(
                "rounded-2xl border px-3.5 py-2",
                aviso ? "border-transparent bg-amber-50/95 text-amber-700" : "border-white/30 bg-white/15",
              )}
            >
              <b className="mr-1.5 text-xl font-bold tabular-nums">{n}</b>
              <span className="text-xs opacity-90">{t}</span>
            </div>
          ))}
        </div>
      </section>

      {escribe && (
        <div className={cn("inline-flex w-max max-w-full gap-1 overflow-x-auto rounded-full bg-white p-[5px]", SOMBRA)} role="tablist">
          {(
            [
              ["galeria", "Galería"],
              ["solicitudes", "Solicitudes"],
            ] as const
          ).map(([v, t]) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={tab === v}
              onClick={() => setTab(v)}
              className={cn(
                "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 font-semibold text-slate-500",
                tab === v && "bg-[#0F172A] text-white",
              )}
            >
              {t}
              {v === "solicitudes" && pendientes > 0 && (
                <span className="inline-grid h-5 min-w-5 place-items-center rounded-full bg-blue-600 px-1.5 text-[11px] text-white">{pendientes}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {tab === "galeria" || !escribe ? (
        <GaleriaFlyers
          busqueda={busqueda}
          onQuitarBusqueda={() => setBusqueda("")}
          admin={escribe}
          recarga={recarga}
          onCambio={() => setRecarga((n) => n + 1)}
          pie={(total) =>
            total === 0 && (
              <p className="rounded-[22px] border-2 border-dashed border-blue-200 bg-white p-[22px] text-center text-[13px] text-slate-500">
                <b className="block text-[15px] text-slate-900">No hay flyers con ese filtro</b>
                Prueba con el código del producto o quita algún filtro.
              </p>
            )
          }
        />
      ) : (
        <BandejaSolicitudes recarga={recarga} onSubir={abrirSubida} onPendientes={onPendientes} />
      )}

      {escribe && (
        <SubirFlyer
          abierto={subiendo}
          onCerrar={() => setSubiendo(false)}
          vinculo={vinculo}
          usuario={String(user?.name || "")}
          onGuardado={(marcadas) => {
            setSubiendo(false);
            setRecarga((n) => n + 1);
            toast({
              title: "Flyer guardado",
              description:
                marcadas > 0
                  ? `Quedó listo en ${marcadas} ${marcadas === 1 ? "solicitud" : "solicitudes"}; se les avisa a los vendedores.`
                  : undefined,
            });
          }}
        />
      )}
    </div>
  );
}
