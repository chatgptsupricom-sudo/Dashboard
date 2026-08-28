"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, Plus, Search, X, XCircle } from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth.store";

/**
 * Registro de una carga de mercancia.
 *
 * La lista de renglones NO se escribe a mano: se trae de la orden de entrega
 * de Odoo. Si la escribiera el mismo que carga el camion, verificar contra
 * ella en el porton no probaria nada.
 */

type Linea = {
  odoo_product_id: number | null;
  producto: string;
  codigo: string | null;
  cantidad_cargada: number;
};

function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export default function MercanciaNueva({
  tipo,
}: {
  tipo: "ingreso" | "egreso";
}) {
  const tm = useTranslations("seguridad.mercancia");
  const t = useTranslations("seguridad");
  const params = useParams();
  const router = useRouter();
  const locale = (params?.locale as string) || "es";
  const { user } = useAuthStore();
  const base = `/${locale}/seguridad/mercancia/${tipo}`;

  const [orden, setOrden] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [errorOrden, setErrorOrden] = useState<string | null>(null);
  const [picking, setPicking] = useState<{
    odoo_picking_id: number;
    odoo_picking_name: string;
    contraparte: string;
  } | null>(null);
  const [lineas, setLineas] = useState<Linea[]>([]);

  const [fecha, setFecha] = useState(hoyISO());
  // Varios almacenistas pueden cargar el mismo camion (issue #43): se agregan
  // uno por uno a una lista, en vez de un solo campo de texto.
  const [almacenistas, setAlmacenistas] = useState<string[]>([]);
  const [almacenistaInput, setAlmacenistaInput] = useState("");
  const [chofer, setChofer] = useState("");
  const [placa, setPlaca] = useState("");
  const [observaciones, setObservaciones] = useState("");
  // La factura buscada arriba se agrega sola a esta lista al encontrarla
  // (ver buscarOrden) — un camion puede salir con mas de una, asi que sigue
  // siendo lista y no un solo campo, para agregar las demas a mano.
  const [facturas, setFacturas] = useState<string[]>([]);
  const [facturaInput, setFacturaInput] = useState("");

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rol = (user?.role || "").toLowerCase().trim();
  // Almacen solo prepara egresos — el ingreso (mercancia que entra por
  // compra) sigue siendo tarea de Seguridad. El backend ya lo rechaza con
  // 403; aqui se bloquea antes para no dejar llenar un formulario que
  // despues no se puede guardar.
  const bloqueadoPorRol = tipo === "ingreso" && rol === "almacen";

  const agregarAlmacenista = () => {
    const v = almacenistaInput.trim().slice(0, 200);
    if (!v || almacenistas.includes(v) || almacenistas.length >= 30) return;
    setAlmacenistas((p) => [...p, v]);
    setAlmacenistaInput("");
  };
  const quitarAlmacenista = (v: string) =>
    setAlmacenistas((p) => p.filter((x) => x !== v));

  const agregarFactura = () => {
    const v = facturaInput.trim().slice(0, 100);
    if (!v || facturas.includes(v) || facturas.length >= 30) return;
    setFacturas((p) => [...p, v]);
    setFacturaInput("");
  };
  const quitarFactura = (v: string) =>
    setFacturas((p) => p.filter((x) => x !== v));

  const buscarOrden = async (valor?: string) => {
    const v = (valor ?? orden).trim();
    if (!v) return;
    setBuscando(true);
    setErrorOrden(null);
    try {
      const res = await fetch(
        `/api/seguridad/mercancia/odoo/${encodeURIComponent(v)}?tipo=${tipo}`,
      );
      if (!res.ok) {
        setErrorOrden(tm("no_encontrada"));
        setPicking(null);
        setLineas([]);
        return;
      }
      const json = await res.json();
      const p = json.picking;
      setPicking({
        odoo_picking_id: p.odoo_picking_id,
        odoo_picking_name: p.odoo_picking_name,
        contraparte: p.contraparte,
      });
      setLineas(p.lineas || []);
      // La factura buscada es una de las que salen en el camion: se agrega
      // sola a la lista, en vez de obligar a volver a escribir el mismo
      // numero que ya se acaba de buscar.
      if (tipo === "egreso" && p.odoo_picking_name) {
        setFacturas((prev) =>
          prev.includes(p.odoo_picking_name) ? prev : [...prev, p.odoo_picking_name],
        );
      }
    } catch {
      setErrorOrden(tm("no_encontrada"));
    } finally {
      setBuscando(false);
    }
  };

  // Llega desde "Ver detalle" de una factura pendiente (Facturas pendientes)
  // con `?factura=` ya resuelto — se busca sola en vez de obligar a
  // retranscribir el numero que la pantalla anterior ya mostraba. Se lee de
  // `window` y no con `useSearchParams` para no arrastrar el Suspense que
  // este pide en build (mismo criterio que ingreso/nuevo/page.tsx).
  useEffect(() => {
    if (tipo !== "egreso") return;
    const pre = new URLSearchParams(window.location.search).get("factura")?.trim();
    if (!pre) return;
    setOrden(pre);
    void buscarOrden(pre);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const guardar = async () => {
    setError(null);
    if (almacenistas.length === 0 || lineas.length === 0) {
      setError(tm("error"));
      return;
    }
    setGuardando(true);
    try {
      const res = await fetch("/api/seguridad/mercancia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo,
          fecha,
          odoo_picking_id: picking?.odoo_picking_id,
          odoo_picking_name: picking?.odoo_picking_name,
          facturas:
            tipo === "egreso" ? facturas : [picking?.odoo_picking_name].filter(Boolean),
          contraparte: picking?.contraparte,
          almacenistas,
          chofer_nombre: chofer.trim() || undefined,
          placa_vehiculo: placa.trim() || undefined,
          observaciones: observaciones.trim() || undefined,
          items: lineas,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || tm("error"));
      router.push(`${base}/${json.id}`);
    } catch (e: any) {
      setError(e?.message || tm("error"));
      setGuardando(false);
    }
  };

  if (bloqueadoPorRol) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-sm text-center space-y-3">
          <XCircle className="w-8 h-8 text-red-500 mx-auto" />
          <p className="text-sm font-semibold text-slate-700">
            {tm("solo_seguridad_ingreso")}
          </p>
          <Link
            href={`/${locale}/seguridad/mercancia/egreso`}
            className="inline-flex text-sm font-semibold text-[color:var(--portal-primary,#741DFE)]"
          >
            {t("back")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/50 font-sans">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <Link
            href={base}
            className="p-2 rounded-[10px] text-slate-500 hover:bg-slate-100"
            aria-label={t("back")}
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <h1 className="text-base sm:text-lg font-bold text-slate-900 truncate">
            {tm(tipo === "ingreso" ? "ingreso_titulo" : "egreso_titulo")}
          </h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-4 pb-28">
        {/* Factura de Odoo */}
        <section className="bg-white border border-slate-200 rounded-[10px] p-5">
          <h2 className="text-sm font-bold text-slate-900 mb-3">
            {tm(tipo === "ingreso" ? "buscar_factura_compra" : "buscar_factura_venta")}
          </h2>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={orden}
              onChange={(e) => setOrden(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  buscarOrden();
                }
              }}
              placeholder={tm(
                tipo === "ingreso" ? "buscar_factura_compra_ph" : "buscar_factura_venta_ph",
              )}
              className="flex-1 h-12 px-3 border border-slate-200 rounded-[10px] text-sm focus:outline-none focus:border-[color:var(--portal-primary,#741DFE)] focus:ring-2 focus:ring-violet-100"
            />
            <button
              type="button"
              onClick={() => buscarOrden()}
              disabled={buscando || !orden.trim()}
              className="h-12 px-4 inline-flex items-center justify-center gap-2 rounded-[10px] text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: "var(--portal-primary,#741DFE)" }}
            >
              {buscando ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              {tm("buscar")}
            </button>
          </div>
          {errorOrden && (
            <p className="mt-3 text-sm text-red-600 flex items-center gap-2">
              <XCircle className="w-4 h-4" />
              {errorOrden}
            </p>
          )}
          {picking && (
            <div className="mt-4 rounded-[10px] border border-violet-200 bg-violet-50/60 p-4">
              <p className="text-sm font-bold text-violet-900">
                {picking.odoo_picking_name}
              </p>
              <p className="text-xs text-slate-600">
                {tm(tipo === "ingreso" ? "proveedor" : "cliente")}:{" "}
                {picking.contraparte || "—"}
              </p>
            </div>
          )}
        </section>

        {/* Renglones traidos de Odoo. Solo lectura: son la referencia contra la
            que se verificara en el porton. */}
        {lineas.length > 0 && (
          <section className="bg-white border border-slate-200 rounded-[10px] p-5">
            <h2 className="text-sm font-bold text-slate-900 mb-3">
              {tm("items")} ({lineas.length})
            </h2>
            <div className="divide-y divide-slate-100">
              {lineas.map((l, i) => (
                <div key={i} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-900 truncate">{l.producto}</p>
                    {l.codigo && (
                      <p className="text-[11px] font-mono text-slate-400">
                        {l.codigo}
                      </p>
                    )}
                  </div>
                  <span className="text-sm font-bold tabular-nums text-slate-700">
                    {l.cantidad_cargada}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Datos del movimiento */}
        <section className="bg-white border border-slate-200 rounded-[10px] p-5 space-y-4">
          <Campo label={tm("fecha")}>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="w-full h-12 px-3 border border-slate-200 rounded-[10px] text-sm"
            />
          </Campo>
          {tipo === "egreso" && (
            <Campo label={tm("factura")}>
              <ListaChips
                valores={facturas}
                input={facturaInput}
                onInput={(v) => setFacturaInput(v.slice(0, 100))}
                onAgregar={agregarFactura}
                onQuitar={quitarFactura}
                placeholder={tm("factura_ph")}
              />
            </Campo>
          )}
          <Campo label={`${tm("almacenista")} *`}>
            <ListaChips
              valores={almacenistas}
              input={almacenistaInput}
              onInput={(v) => setAlmacenistaInput(v.slice(0, 200))}
              onAgregar={agregarAlmacenista}
              onQuitar={quitarAlmacenista}
              placeholder={tm("almacenista")}
            />
          </Campo>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Campo label={tm("chofer")}>
              <input
                type="text"
                value={chofer}
                onChange={(e) => setChofer(e.target.value.slice(0, 200))}
                className="w-full h-12 px-3 border border-slate-200 rounded-[10px] text-sm"
              />
            </Campo>
            <Campo label={tm("placa")}>
              <input
                type="text"
                value={placa}
                onChange={(e) => setPlaca(e.target.value.slice(0, 50))}
                className="w-full h-12 px-3 border border-slate-200 rounded-[10px] text-sm uppercase"
              />
            </Campo>
          </div>
          <Campo label={tm("observaciones")}>
            <textarea
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value.slice(0, 5000))}
              className="w-full min-h-[80px] px-3 py-2 border border-slate-200 rounded-[10px] text-sm"
            />
          </Campo>
        </section>

        {error && (
          <div className="rounded-[10px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
      </main>

      <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/95 backdrop-blur">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3">
          <button
            type="button"
            onClick={guardar}
            disabled={guardando || lineas.length === 0 || almacenistas.length === 0}
            className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 rounded-[10px] text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: "var(--portal-primary,#741DFE)" }}
          >
            {guardando && <Loader2 className="w-4 h-4 animate-spin" />}
            {tm("guardar")}
          </button>
        </div>
      </div>
    </div>
  );
}

function Campo({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

/** Lista editable de chips (facturas o almacenistas): agregar de a uno, quitar con la X. */
function ListaChips({
  valores,
  input,
  onInput,
  onAgregar,
  onQuitar,
  placeholder,
}: {
  valores: string[];
  input: string;
  onInput: (v: string) => void;
  onAgregar: () => void;
  onQuitar: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => onInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onAgregar();
            }
          }}
          placeholder={placeholder}
          className="flex-1 h-12 px-3 border border-slate-200 rounded-[10px] text-sm"
        />
        <button
          type="button"
          onClick={onAgregar}
          disabled={!input.trim()}
          className="h-12 w-12 shrink-0 inline-flex items-center justify-center rounded-[10px] border border-slate-200 text-slate-600 disabled:opacity-40"
          aria-label="+"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
      {valores.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {valores.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full bg-violet-50 border border-violet-200 text-xs font-semibold text-violet-800"
            >
              {v}
              <button
                type="button"
                onClick={() => onQuitar(v)}
                className="p-0.5 rounded-full hover:bg-violet-100"
                aria-label="x"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
