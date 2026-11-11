"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth.store";
import { useToast } from "@/hooks/use-toast";
import { GaleriaFlyers, SOMBRA } from "@/components/banco-imagenes/GaleriaFlyers";
import { PedirFlyer } from "@/components/banco-imagenes/PedirFlyer";
import { MisSolicitudes, type SolicitudFlyer } from "@/components/banco-imagenes/MisSolicitudes";
import { cn } from "@/lib/utils";

const LO_MAS_BUSCADO = ["Impresoras", "Laptops", "HP", "Epson", "Tinta"];

/**
 * Banco de Flyers del vendedor: busca, revisa el precio y descarga. Si falta un
 * flyer lo pide (solo vendedores: el Gerente de Marca usa esta misma pantalla
 * para consultar y no pide).
 */
export default function VendedoresBancoImagenesPage() {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const rol = String(user?.role || "").toLowerCase();
  const pide = rol === "vendedor" || rol === "seller";

  const [busqueda, setBusqueda] = useState("");
  const [tab, setTab] = useState<"galeria" | "solicitudes">("galeria");
  const [pidiendo, setPidiendo] = useState(false);
  const [precarga, setPrecarga] = useState("");
  const [solicitudes, setSolicitudes] = useState<SolicitudFlyer[]>([]);
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async () => {
    if (!pide) return;
    setCargando(true);
    try {
      const r = await fetch("/api/vendedores/banco-imagenes/solicitudes");
      const d = await r.json();
      if (r.ok) setSolicitudes(d.solicitudes || []);
    } finally {
      setCargando(false);
    }
  }, [pide]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // El correo de avance enlaza con ?tab=solicitudes.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "solicitudes") setTab("solicitudes");
  }, []);

  const pedir = (texto = "") => {
    setPrecarga(texto);
    setPidiendo(true);
  };

  async function cancelar(id: number) {
    if (!confirm("¿Cancelar esta solicitud?")) return;
    const r = await fetch("/api/vendedores/banco-imagenes/solicitudes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, accion: "cancelar" }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) toast({ title: d?.error || "No se pudo cancelar", variant: "destructive" });
    await cargar();
  }

  const abiertas = solicitudes.filter((s) => s.estado === "pendiente" || s.estado === "en_desarrollo").length;

  return (
    <div className="grid gap-[18px] pb-20">
      <section className="relative grid min-w-0 gap-4 overflow-hidden rounded-[26px] bg-[linear-gradient(135deg,#1e3a8a_0%,#2563eb_55%,#60a5fa_100%)] p-6 text-white shadow-[0_18px_40px_rgba(37,99,235,.28)]">
        <span className="pointer-events-none absolute -right-28 -top-36 h-[380px] w-[380px] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,.22),transparent_70%)]" />
        <div className="relative flex flex-wrap items-start justify-between gap-3.5">
          <div>
            <h1 className="text-[22px] font-bold leading-tight tracking-tight [text-wrap:balance] sm:text-[28px]">
              Flyers listos para enviar a tus clientes
            </h1>
            <p className="mt-1 max-w-[56ch] opacity-90">
              Busca el producto, revisa el precio y descárgalo.
              {pide && " Si falta un flyer, pídelo y te avisamos cuando esté listo."}
            </p>
          </div>
          {pide && (
            <button
              type="button"
              onClick={() => pedir()}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-[18px] font-bold text-blue-600 shadow-[0_8px_20px_rgba(15,23,42,.18)]"
            >
              <Plus className="h-4 w-4" strokeWidth={2.4} />
              Pedir flyer
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
            placeholder="Código, modelo o marca. Ej: L3250, laptop HP"
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
        <div className="relative flex flex-wrap items-center gap-1.5">
          <span className="text-xs opacity-85">Lo más buscado:</span>
          {LO_MAS_BUSCADO.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setBusqueda(t);
                setTab("galeria");
              }}
              className="h-[30px] rounded-full border border-white/35 bg-white/15 px-3 text-xs font-semibold hover:bg-white/25"
            >
              {t}
            </button>
          ))}
        </div>
      </section>

      {pide && (
        <div className={cn("inline-flex w-max max-w-full gap-1 overflow-x-auto rounded-full bg-white p-[5px]", SOMBRA)} role="tablist">
          {(
            [
              ["galeria", "Galería"],
              ["solicitudes", "Mis solicitudes"],
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
              {v === "solicitudes" && abiertas > 0 && (
                <span className="inline-grid h-5 min-w-5 place-items-center rounded-full bg-blue-600 px-1.5 text-[11px] text-white">{abiertas}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {tab === "galeria" ? (
        <GaleriaFlyers
          busqueda={busqueda}
          onQuitarBusqueda={() => setBusqueda("")}
          pie={(total) =>
            pide && (
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-[22px] border-2 border-dashed border-blue-200 bg-white p-[22px]">
                <div>
                  <b className="block text-[15px]">
                    {total === 0 && busqueda.trim()
                      ? `No hay flyer para “${busqueda.trim()}”. ¿Lo pedimos?`
                      : "¿No encuentras el flyer que necesitas?"}
                  </b>
                  <span className="text-[13px] text-slate-500">
                    Pídelo y AdminLeads lo prepara. Puedes pedir varios productos o una categoría completa.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => pedir(busqueda.trim())}
                  className="h-9 rounded-full bg-[#0F172A] px-3.5 text-[13px] font-semibold text-white hover:bg-slate-800"
                >
                  Pedir este flyer
                </button>
              </div>
            )
          }
        />
      ) : (
        <MisSolicitudes solicitudes={solicitudes} cargando={cargando} onCancelar={cancelar} />
      )}

      {pide && (
        <PedirFlyer
          abierto={pidiendo}
          onCerrar={() => setPidiendo(false)}
          busquedaInicial={precarga}
          onEnviada={(codigo, estado) => {
            setPidiendo(false);
            toast({
              title: `Solicitud ${codigo} enviada`,
              description:
                estado === "en_desarrollo"
                  ? "Esos flyers ya estaban en desarrollo: te avisamos cuando estén listos."
                  : "Queda pendiente de revisión.",
            });
            setTab("solicitudes");
            cargar();
          }}
        />
      )}
    </div>
  );
}
