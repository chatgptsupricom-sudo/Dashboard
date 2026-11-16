"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { SOMBRA } from "@/components/banco-imagenes/GaleriaFlyers";
import {
  Avance,
  ItemsSolicitud,
  PILL_ESTADO,
  fechaCorta,
  tituloSolicitud,
  type SolicitudFlyer,
} from "@/components/banco-imagenes/MisSolicitudes";
import type { Vinculo } from "@/components/banco-imagenes/SubirFlyer";
import { cn } from "@/lib/utils";

const ESTADO_ADMIN: Record<SolicitudFlyer["estado"], string> = {
  pendiente: "Por revisar",
  en_desarrollo: "En desarrollo",
  completada: "Completada",
  rechazada: "Rechazada",
  cancelada: "Cancelada",
};
const FILTROS = ["pendiente", "en_desarrollo", "completada", "rechazada", "todas"] as const;
const SEDE: Record<number, string> = { 9: "Valencia", 10: "Caracas", 7: "Panamá" };

interface FilaProducto {
  id: number;
  odooProductId: number;
  productCode: string | null;
  nombre: string;
  estado: "por_aprobar" | "en_desarrollo";
  vendedores: string[];
  solicitudes: { id: number; codigo: string }[];
  urgencia: "normal" | "alta";
  paraCuando: string | null;
}

/** Formulario en línea: rechazar una solicitud o descartar un producto. */
type Form = { tipo: "rechazar"; solicitudId: number } | { tipo: "descartar"; solicitudId?: number; itemId?: number; pendienteId?: number };

const btn = "h-[30px] flex-none rounded-full px-3 text-xs font-semibold";

/**
 * Bandeja de AdminLeads: por solicitud (aprobar, rechazar, descartar y subir el
 * flyer de cada producto) o por producto (una fila por producto por diseñar,
 * con cuántos vendedores lo piden; subir o descartar afecta a todos).
 */
export function BandejaSolicitudes({
  recarga,
  onSubir,
  onPendientes,
}: {
  recarga: number;
  onSubir: (v: Vinculo) => void;
  onPendientes: (n: number) => void;
}) {
  const { toast } = useToast();
  const [vista, setVista] = useState<"solicitud" | "producto">("solicitud");
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]>("pendiente");
  const [solicitudes, setSolicitudes] = useState<SolicitudFlyer[]>([]);
  const [productos, setProductos] = useState<FilaProducto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [abierta, setAbierta] = useState<number | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState(false);

  // Se piden todas y se filtra aquí: así los contadores de cada estado salen de una consulta.
  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [rs, rp] = await Promise.all([
        fetch("/api/adminleads/banco-imagenes/solicitudes?estado=todas"),
        fetch("/api/adminleads/banco-imagenes/solicitudes/por-producto"),
      ]);
      const ds = await rs.json();
      const dp = await rp.json();
      if (rs.ok) {
        setSolicitudes(ds.solicitudes || []);
        onPendientes(ds.pendientes || 0);
      }
      if (rp.ok) setProductos(dp.productos || []);
    } finally {
      setCargando(false);
    }
  }, [onPendientes]);

  useEffect(() => {
    cargar();
  }, [cargar, recarga]);

  async function accion(url: string, body: any, ok: string) {
    setOcupado(true);
    try {
      const r = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast({ title: d?.error || "No se pudo", variant: "destructive" });
        return false;
      }
      toast({ title: ok });
      setForm(null);
      setTexto("");
      await cargar();
      return true;
    } finally {
      setOcupado(false);
    }
  }

  const enviarForm = () => {
    if (!form) return;
    if (form.tipo === "rechazar") {
      return accion(
        `/api/adminleads/banco-imagenes/solicitudes/${form.solicitudId}`,
        { accion: "rechazar", motivo: texto },
        "Solicitud rechazada",
      );
    }
    if (form.pendienteId) {
      return accion(
        `/api/adminleads/banco-imagenes/solicitudes/por-producto/${form.pendienteId}`,
        { accion: "descartar", nota: texto },
        "Producto descartado en todas sus solicitudes",
      );
    }
    return accion(
      `/api/adminleads/banco-imagenes/solicitudes/${form.solicitudId}`,
      { accion: "descartar_item", item_id: form.itemId, nota: texto },
      "Producto descartado",
    );
  };

  const formEnLinea = (titulo: string, placeholder: string) => (
    <div className="grid gap-2 rounded-2xl bg-slate-50 p-3">
      <label className="text-[13px] font-semibold">{titulo}</label>
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder={placeholder}
        autoFocus
        className="h-20 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
      />
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={() => setForm(null)} className="h-9 rounded-full border border-slate-200 bg-white px-3.5 text-[13px] font-semibold text-slate-600">
          Cancelar
        </button>
        <button
          type="button"
          onClick={enviarForm}
          disabled={ocupado || !texto.trim()}
          className="h-9 rounded-full bg-red-600 px-3.5 text-[13px] font-semibold text-white disabled:opacity-45"
        >
          {form?.tipo === "rechazar" ? "Rechazar" : "Descartar"}
        </button>
      </div>
    </div>
  );

  const lista = filtro === "todas" ? solicitudes : solicitudes.filter((s) => s.estado === filtro);
  const segBtn = (v: "solicitud" | "producto", t: string) => (
    <button
      type="button"
      aria-pressed={vista === v}
      onClick={() => setVista(v)}
      className={cn("h-9 rounded-full text-[13px] font-semibold text-slate-500", vista === v && "bg-white text-blue-600 shadow-[0_1px_3px_rgba(15,23,42,.1)]")}
    >
      {t}
    </button>
  );

  return (
    <div className="grid gap-3.5">
      <div className="grid max-w-[380px] grid-cols-2 gap-1 rounded-full bg-white p-1" role="group" aria-label="Ver por">
        {segBtn("solicitud", "Por solicitud")}
        {segBtn("producto", `Por producto${productos.length ? ` (${productos.length})` : ""}`)}
      </div>

      {cargando && (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      )}

      {!cargando && vista === "solicitud" && (
        <>
          <div className="flex flex-wrap gap-1.5">
            {FILTROS.map((e) => {
              const n = e === "todas" ? solicitudes.length : solicitudes.filter((s) => s.estado === e).length;
              return (
                <button
                  key={e}
                  type="button"
                  aria-pressed={filtro === e}
                  onClick={() => setFiltro(e)}
                  className={cn(
                    "inline-flex h-[34px] items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-600",
                    filtro === e && "border-transparent bg-blue-600 text-white",
                  )}
                >
                  {e === "todas" ? "Todas" : ESTADO_ADMIN[e]}
                  <span className={cn("rounded-full px-1.5 text-[11px]", filtro === e ? "bg-white/20" : "bg-slate-50 text-slate-400")}>{n}</span>
                </button>
              );
            })}
          </div>

          {lista.length === 0 && (
            <p className="rounded-[22px] border-2 border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
              No hay solicitudes en este estado
            </p>
          )}

          {lista.map((s) => {
            const open = abierta === s.id;
            return (
              <article key={s.id} className={cn("grid min-w-0 gap-3 rounded-[22px] bg-white p-[18px]", SOMBRA, open && "outline outline-2 outline-blue-200")}>
                <button type="button" onClick={() => setAbierta(open ? null : s.id)} className="flex flex-wrap items-start justify-between gap-2.5 text-left">
                  <div className="min-w-0">
                    <b className="text-[15px] text-slate-900">{tituloSolicitud(s)}</b>
                    <small className="block text-xs text-slate-500">
                      {s.codigo}, {s.vendedorNombre}, {fechaCorta(s.createdAt)}
                    </small>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {s.urgencia === "alta" && <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-600">Urgente</span>}
                    <span className={cn("whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold", PILL_ESTADO[s.estado])}>
                      {ESTADO_ADMIN[s.estado]}
                    </span>
                    <ChevronDown className={cn("h-4 w-4 text-slate-400 transition-transform", open && "rotate-180")} />
                  </div>
                </button>

                <Avance s={s} />

                {open && (
                  <>
                    <div className="flex flex-wrap gap-3.5 text-xs text-slate-500">
                      <span>
                        Vendedor <b className="font-semibold text-slate-900">{s.vendedorNombre}</b>
                      </span>
                      {s.companyId !== null && (
                        <span>
                          Sede <b className="font-semibold text-slate-900">{SEDE[s.companyId] || s.companyId}</b>
                        </span>
                      )}
                      <span>
                        Urgencia <b className="font-semibold text-slate-900">{s.urgencia === "alta" ? "Alta" : "Normal"}</b>
                      </span>
                      {s.paraCuando && (
                        <span>
                          Para el <b className="font-semibold text-slate-900">{fechaCorta(s.paraCuando)}</b>
                        </span>
                      )}
                      {s.revisadoPor && (
                        <span>
                          Revisó <b className="font-semibold text-slate-900">{s.revisadoPor}</b>
                        </span>
                      )}
                    </div>
                    <p className="rounded-xl bg-slate-50 px-3 py-2 text-[13px] text-slate-600">{s.motivo}</p>
                    {s.estado === "rechazada" && s.motivoRechazo && (
                      <p className="rounded-xl bg-red-50 px-3 py-2 text-[13px] text-red-700">Motivo: {s.motivoRechazo}</p>
                    )}

                    <ItemsSolicitud
                      s={s}
                      acciones={(i) =>
                        i.estado === "pendiente" && (s.estado === "pendiente" || s.estado === "en_desarrollo") ? (
                          <span className="flex flex-none gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                onSubir({
                                  etiqueta: `Para ${s.codigo}, pedido por ${s.vendedorNombre}${i.otrosVendedores ? ` y ${i.otrosVendedores} más` : ""}`,
                                  odooProductId: i.odooProductId,
                                  productCode: i.productCode,
                                  nombre: i.nombre,
                                  marca: i.marca,
                                  categoria: i.categoria,
                                })
                              }
                              className={cn(btn, "bg-[#0F172A] text-white")}
                            >
                              Subir flyer
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setForm({ tipo: "descartar", solicitudId: s.id, itemId: i.id });
                                setTexto("");
                              }}
                              className={cn(btn, "border border-slate-200 bg-white text-slate-600")}
                            >
                              Descartar
                            </button>
                          </span>
                        ) : null
                      }
                    />

                    {form?.tipo === "descartar" && form.solicitudId === s.id &&
                      formEnLinea(
                        "¿Por qué no se hará? Lo ve el vendedor",
                        "Ej: producto descontinuado en Odoo. Si otros vendedores lo pidieron, se descarta para todos.",
                      )}
                    {form?.tipo === "rechazar" && form.solicitudId === s.id &&
                      formEnLinea("Motivo del rechazo. Lo ve el vendedor", "Ej: ya hay un flyer genérico de esa línea")}

                    {s.estado === "pendiente" && !form && (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={ocupado}
                          onClick={() =>
                            accion(`/api/adminleads/banco-imagenes/solicitudes/${s.id}`, { accion: "aprobar" }, `${s.codigo} aprobada`)
                          }
                          className="h-9 rounded-full bg-blue-600 px-4 text-[13px] font-semibold text-white disabled:opacity-45"
                        >
                          {s.tipo === "categoria" ? "Aprobar y armar la lista" : "Aprobar"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setForm({ tipo: "rechazar", solicitudId: s.id });
                            setTexto("");
                          }}
                          className="h-9 rounded-full border border-slate-200 bg-white px-3.5 text-[13px] font-semibold text-slate-600 hover:text-red-600"
                        >
                          Rechazar
                        </button>
                      </div>
                    )}
                  </>
                )}
              </article>
            );
          })}
        </>
      )}

      {!cargando && vista === "producto" && (
        <>
          {productos.length === 0 && (
            <p className="rounded-[22px] border-2 border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
              No hay productos por diseñar
            </p>
          )}
          {productos.map((p) => (
            <article key={p.id} className={cn("grid min-w-0 gap-2.5 rounded-[22px] bg-white p-4", SOMBRA)}>
              <div className="flex flex-wrap items-start justify-between gap-2.5">
                <div className="min-w-0">
                  <b className="text-[15px] text-slate-900">{p.nombre}</b>
                  <small className="block text-xs text-slate-500">
                    {[p.productCode, p.solicitudes.map((x) => x.codigo).join(", ")].filter(Boolean).join(" · ")}
                  </small>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {p.urgencia === "alta" && <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-600">Urgente</span>}
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                      p.estado === "en_desarrollo" ? "bg-blue-50 text-blue-600" : "bg-amber-50 text-amber-700",
                    )}
                  >
                    {p.estado === "en_desarrollo" ? "En desarrollo" : "Por aprobar"}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-3.5 text-xs text-slate-500">
                <span>
                  Lo {p.vendedores.length === 1 ? "pide" : "piden"}{" "}
                  <b className="font-semibold text-slate-900">
                    {p.vendedores.length} {p.vendedores.length === 1 ? "vendedor" : "vendedores"}
                  </b>
                  : {p.vendedores.join(", ")}
                </span>
                {p.paraCuando && (
                  <span>
                    Para el <b className="font-semibold text-slate-900">{fechaCorta(p.paraCuando)}</b>
                  </span>
                )}
              </div>
              {form?.tipo === "descartar" && form.pendienteId === p.id ? (
                formEnLinea("¿Por qué no se hará? Se descarta en todas sus solicitudes", "Ej: producto descontinuado en Odoo")
              ) : (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      onSubir({
                        etiqueta: `Lo piden ${p.vendedores.join(", ")} (${p.solicitudes.map((x) => x.codigo).join(", ")})`,
                        odooProductId: p.odooProductId,
                        productCode: p.productCode,
                        nombre: p.nombre,
                        marca: null,
                        categoria: null,
                      })
                    }
                    className="h-9 rounded-full bg-[#0F172A] px-3.5 text-[13px] font-semibold text-white"
                  >
                    Subir flyer
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setForm({ tipo: "descartar", pendienteId: p.id });
                      setTexto("");
                    }}
                    className="h-9 rounded-full border border-slate-200 bg-white px-3.5 text-[13px] font-semibold text-slate-600"
                  >
                    Descartar
                  </button>
                </div>
              )}
            </article>
          ))}
        </>
      )}
    </div>
  );
}
