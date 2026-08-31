"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Loader2, Package, Plus, Search, X, XCircle } from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth.store";
import { PageHeader, Card, SectionTitle, BotonPrimario, inputClases, labelClases } from "./mercancia-ui";

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
  const tAlm = useTranslations("seguridad.mercancia.almacenistas_catalogo");
  const tCho = useTranslations("seguridad.mercancia.choferes_catalogo");
  const tUni = useTranslations("seguridad.mercancia.unidades");
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
  const [chofer, setChofer] = useState("");
  const [placa, setPlaca] = useState("");
  const [observaciones, setObservaciones] = useState("");
  // La orden buscada arriba se agrega sola a esta lista al encontrarla (ver
  // buscarOrden) — un camion puede salir con mas de una orden de despacho,
  // asi que sigue siendo lista y no un solo campo, para agregar las demas a
  // mano.
  const [facturas, setFacturas] = useState<string[]>([]);
  const [facturaInput, setFacturaInput] = useState("");

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Catalogos para los selects de almacenista/chofer/placa — ya no se
  // escriben a mano, se eligen de lo que este registrado.
  const [almacenistasCat, setAlmacenistasCat] = useState<
    { id: number; nombre: string }[]
  >([]);
  const [choferesCat, setChoferesCat] = useState<{ id: number; nombre: string }[]>([]);
  const [unidadesCat, setUnidadesCat] = useState<
    { id: number; placa: string; descripcion: string | null }[]
  >([]);

  useEffect(() => {
    (async () => {
      try {
        const [ra, rc, ru] = await Promise.all([
          fetch("/api/seguridad/mercancia/catalogo/almacenistas"),
          fetch("/api/seguridad/mercancia/catalogo/choferes"),
          fetch("/api/seguridad/mercancia/catalogo/unidades"),
        ]);
        if (ra.ok) setAlmacenistasCat((await ra.json()).almacenistas || []);
        if (rc.ok) setChoferesCat((await rc.json()).choferes || []);
        if (ru.ok) setUnidadesCat((await ru.json()).unidades || []);
      } catch {
        // Los selects quedan vacios; el enlace "Gestionar..." sigue ahi para
        // ir a registrar antes de volver.
      }
    })();
  }, []);

  const rol = (user?.role || "").toLowerCase().trim();
  // Almacen solo prepara egresos — el ingreso (mercancia que entra por
  // compra) sigue siendo tarea de Seguridad. El backend ya lo rechaza con
  // 403; aqui se bloquea antes para no dejar llenar un formulario que
  // despues no se puede guardar.
  const bloqueadoPorRol = tipo === "ingreso" && rol === "almacen";

  const agregarAlmacenista = (v: string) => {
    if (!v || almacenistas.includes(v) || almacenistas.length >= 30) return;
    setAlmacenistas((p) => [...p, v]);
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
      // La orden buscada es una de las que salen en el camion: se agrega
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

  // Llega desde "Ver detalle" de una orden pendiente (Órdenes de despacho
  // pendientes) con `?factura=` ya resuelto — se busca sola en vez de obligar
  // a retranscribir el numero que la pantalla anterior ya mostraba. Se lee de
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
      <div className="min-h-screen flex items-center justify-center px-4 bg-slate-50">
        <div className="max-w-sm text-center space-y-3">
          <span className="w-12 h-12 rounded-full bg-red-50 text-red-500 flex items-center justify-center mx-auto">
            <XCircle className="w-6 h-6" />
          </span>
          <p className="text-sm font-medium text-slate-700">
            {tm("solo_seguridad_ingreso")}
          </p>
          <Link
            href={`/${locale}/seguridad/mercancia/egreso`}
            className="inline-flex text-sm font-semibold text-[color:var(--portal-primary,#741DFE)] hover:opacity-75"
          >
            {t("back")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <PageHeader
        titulo={tm(tipo === "ingreso" ? "ingreso_titulo" : "egreso_titulo")}
        volverA={base}
      />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-4 pb-28">
        {/* Factura de Odoo */}
        <Card>
          <SectionTitle>
            {tm(tipo === "ingreso" ? "buscar_factura_compra" : "buscar_factura_venta")}
          </SectionTitle>
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
              className={inputClases}
            />
            <BotonPrimario
              onClick={() => buscarOrden()}
              disabled={buscando || !orden.trim()}
              icon={buscando ? undefined : Search}
              className="shrink-0"
            >
              {buscando && <Loader2 className="w-4 h-4 animate-spin" />}
              {tm("buscar")}
            </BotonPrimario>
          </div>
          {errorOrden && (
            <p className="mt-3 text-sm text-red-600 flex items-center gap-1.5">
              <XCircle className="w-4 h-4 shrink-0" />
              {errorOrden}
            </p>
          )}
          {picking && (
            <div className="mt-4 rounded-xl border border-violet-100 bg-violet-50/60 p-4">
              <p className="text-sm font-semibold text-violet-900">
                {picking.odoo_picking_name}
              </p>
              <p className="text-xs text-violet-700/80 mt-0.5">
                {tm(tipo === "ingreso" ? "proveedor" : "cliente")}:{" "}
                {picking.contraparte || "—"}
              </p>
            </div>
          )}
        </Card>

        {/* Renglones traidos de Odoo. Solo lectura: son la referencia contra la
            que se verificara en el porton. */}
        {lineas.length > 0 && (
          <Card>
            <SectionTitle>
              {tm("items")} ({lineas.length})
            </SectionTitle>
            <div className="divide-y divide-slate-100 -mx-5">
              {lineas.map((l, i) => (
                <div key={i} className="flex items-center gap-3 px-5 py-2.5">
                  <span className="w-7 h-7 rounded-lg bg-slate-50 text-slate-400 flex items-center justify-center shrink-0">
                    <Package className="w-3.5 h-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-800 truncate">{l.producto}</p>
                    {l.codigo && (
                      <p className="text-[11px] font-mono text-slate-400">
                        {l.codigo}
                      </p>
                    )}
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-slate-700">
                    {l.cantidad_cargada}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Datos del movimiento */}
        <Card className="space-y-4">
          <div>
            <label className={labelClases}>{tm("fecha")}</label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className={inputClases}
            />
          </div>
          {tipo === "egreso" && (
            <div>
              <label className={labelClases}>{tm("factura")}</label>
              <ListaChips
                valores={facturas}
                input={facturaInput}
                onInput={(v) => setFacturaInput(v.slice(0, 100))}
                onAgregar={agregarFactura}
                onQuitar={quitarFactura}
                placeholder={tm("factura_ph")}
              />
            </div>
          )}
          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <label className={`${labelClases} mb-0`}>{tm("almacenista")} *</label>
              <Link
                href={`/${locale}/seguridad/mercancia/almacenistas`}
                className="text-[11px] font-semibold text-[color:var(--portal-primary,#741DFE)] hover:opacity-75 shrink-0"
              >
                {tAlm("gestionar")}
              </Link>
            </div>
            <SelectChips
              valores={almacenistas}
              opciones={almacenistasCat.map((a) => a.nombre)}
              onAgregar={agregarAlmacenista}
              onQuitar={quitarAlmacenista}
              placeholder={tAlm("select_placeholder")}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label className={`${labelClases} mb-0`}>{tm("chofer")}</label>
                <Link
                  href={`/${locale}/seguridad/mercancia/choferes`}
                  className="text-[11px] font-semibold text-[color:var(--portal-primary,#741DFE)] hover:opacity-75 shrink-0"
                >
                  {tCho("gestionar")}
                </Link>
              </div>
              <select
                value={chofer}
                onChange={(e) => setChofer(e.target.value)}
                className={inputClases}
              >
                <option value="">{tCho("select_placeholder")}</option>
                {choferesCat.map((c) => (
                  <option key={c.id} value={c.nombre}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label className={`${labelClases} mb-0`}>{tm("placa")}</label>
                <Link
                  href={`/${locale}/seguridad/mercancia/unidades`}
                  className="text-[11px] font-semibold text-[color:var(--portal-primary,#741DFE)] hover:opacity-75 shrink-0"
                >
                  {tUni("gestionar")}
                </Link>
              </div>
              <select
                value={placa}
                onChange={(e) => setPlaca(e.target.value)}
                className={inputClases}
              >
                <option value="">{tUni("select_placeholder")}</option>
                {unidadesCat.map((u) => (
                  <option key={u.id} value={u.placa}>
                    {u.placa}
                    {u.descripcion ? ` — ${u.descripcion}` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className={labelClases}>{tm("observaciones")}</label>
            <textarea
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value.slice(0, 5000))}
              className={`${inputClases} h-auto min-h-[88px] py-2.5`}
            />
          </div>
        </Card>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
      </main>

      <div className="fixed inset-x-0 bottom-0 border-t border-slate-200/70 bg-white/90 backdrop-blur">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-3">
          <BotonPrimario
            onClick={guardar}
            disabled={guardando || lineas.length === 0 || almacenistas.length === 0}
            className="w-full h-12"
          >
            {guardando && <Loader2 className="w-4 h-4 animate-spin" />}
            {tm("guardar")}
          </BotonPrimario>
        </div>
      </div>
    </div>
  );
}

/** Multi-select de un catalogo: se elige de un <select>, queda como chip removible. */
function SelectChips({
  valores,
  opciones,
  onAgregar,
  onQuitar,
  placeholder,
}: {
  valores: string[];
  opciones: string[];
  onAgregar: (v: string) => void;
  onQuitar: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div>
      <select
        value=""
        onChange={(e) => {
          if (e.target.value) onAgregar(e.target.value);
        }}
        className={inputClases}
      >
        <option value="">{placeholder}</option>
        {opciones
          .filter((o) => !valores.includes(o))
          .map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
      </select>
      {valores.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {valores.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full bg-violet-50 text-xs font-medium text-violet-700"
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

/** Lista editable de chips (facturas): agregar de a uno, quitar con la X. */
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
          className={inputClases}
        />
        <button
          type="button"
          onClick={onAgregar}
          disabled={!input.trim()}
          className="h-11 w-11 shrink-0 inline-flex items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 transition-colors"
          aria-label="+"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
      {valores.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {valores.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full bg-violet-50 text-xs font-medium text-violet-700"
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
