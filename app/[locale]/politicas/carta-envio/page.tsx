"use client";

import { CARTA_VACIA, documentoCarta, htmlCarta, type DatosCarta, type EmpresaCarta } from "@/lib/politicas/cartaEnvio";
import { SEDES_POLITICA } from "@/lib/politicas/permisos";
import { useAuthStore } from "@/lib/stores/auth.store";
import { ArrowLeft, FileDown, Loader2, Printer, RotateCcw, Search } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

type Cliente = { id: number; nombre: string; rif: string; direccion: string; telefono: string; email: string };

const campo = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const etiqueta = "mb-1 block text-xs font-semibold text-slate-600";
const hoy = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Caracas" });
const SEDES = [9, 10, 7];

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-bold text-slate-900">{titulo}</h2>
      {children}
    </section>
  );
}

/** Carta de autorización de envío: datos del cliente desde Odoo, el resto a mano; se imprime (PDF) o baja en Word. */
export default function CartaEnvioPage() {
  const { locale } = useParams<{ locale: string }>();
  const { user } = useAuthStore();
  const rol = String(user?.role ?? "").toLowerCase().trim();
  // Administración queda en su sede (la API también lo fuerza).
  const sedeFija = rol.startsWith("administraci") ? Number((user as any)?.cids) || null : null;
  const [sede, setSede] = useState<number>(sedeFija || Number((user as any)?.cids) || 9);
  const [empresa, setEmpresa] = useState<EmpresaCarta | null>(null);
  const [d, setD] = useState<DatosCarta>({ ...CARTA_VACIA, fecha: hoy() });
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [buscando, setBuscando] = useState(false);

  const set = <K extends keyof DatosCarta>(k: K, val: DatosCarta[K]) => setD((x) => ({ ...x, [k]: val }));

  useEffect(() => {
    setError(null);
    fetch(`/api/politicas/carta-envio?sede=${sede}`)
      .then((r) => r.json().then((j) => (r.ok ? j : Promise.reject(new Error(j?.error || "Error")))))
      .then((j) => {
        setEmpresa(j.empresa);
        setD((x) => ({ ...x, lugar: x.lugar || j.empresa.ciudad || "" }));
      })
      .catch((e) => setError(e.message));
  }, [sede]);

  // Búsqueda de clientes en Odoo, con una pausa para no consultar en cada tecla.
  useEffect(() => {
    const q = busqueda.trim();
    if (q.length < 2) return setClientes([]);
    const t = setTimeout(() => {
      setBuscando(true);
      fetch(`/api/politicas/carta-envio?sede=${sede}&q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((j) => setClientes(j.clientes || []))
        .catch(() => setClientes([]))
        .finally(() => setBuscando(false));
    }, 300);
    return () => clearTimeout(t);
  }, [busqueda, sede]);

  const elegir = (c: Cliente) => {
    setD((x) => ({ ...x, cliente: c.nombre, rifCliente: c.rif, direccionCliente: c.direccion, destino: x.destino || c.direccion }));
    setBusqueda("");
    setClientes([]);
  };

  // Mismo patrón que el PDF del Organigrama: iframe de tamaño 0 (con display:none Chrome imprime en blanco).
  const imprimir = () => {
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument!;
    doc.open();
    doc.write(documentoCarta(d, empresa, { origen: location.origin }));
    doc.close();
    // Espera a que carguen el logo y la marca de agua (máx. 3 s) antes de abrir el diálogo ("Guardar como PDF").
    const cargadas = [...doc.images].map((img) =>
      img.complete ? null : new Promise((ok) => ((img.onload = ok), (img.onerror = ok))),
    );
    Promise.race([Promise.all(cargadas), new Promise((ok) => setTimeout(ok, 3000))]).then(() => {
      iframe.contentWindow!.focus();
      iframe.contentWindow!.print();
      setTimeout(() => iframe.remove(), 60_000);
    });
  };

  const descargarWord = () => {
    // Word abre HTML como documento editable; el logo va por URL completa, sin marca de agua.
    const blob = new Blob(["﻿", documentoCarta(d, empresa, { origen: location.origin, word: true })], { type: "application/msword" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Carta autorizacion envio${d.cliente ? ` - ${d.cliente.replace(/[\\/:*?"<>|]/g, "")}` : ""}.doc`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const fiscal = sede === 7 ? "RUC" : "RIF";

  return (
    <div className="space-y-4 p-4 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={`/${locale}/politicas`} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" /> Políticas y Acuerdos
        </Link>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setD({ ...CARTA_VACIA, fecha: hoy(), lugar: empresa?.ciudad || "" })}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RotateCcw className="h-4 w-4" /> Limpiar
          </button>
          <button
            onClick={descargarWord}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <FileDown className="h-4 w-4" /> Word
          </button>
          <button
            onClick={imprimir}
            disabled={!empresa}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            <Printer className="h-4 w-4" /> Imprimir / PDF
          </button>
        </div>
      </div>

      <div>
        <h1 className="text-2xl font-black text-slate-900">Carta de autorización de envío</h1>
        <p className="text-sm text-slate-500">
          Busca al cliente en Odoo y llena el resto. Lo que dejes vacío sale como línea para llenar a mano.
        </p>
      </div>

      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Bloque titulo="Carta">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={etiqueta} htmlFor="ce-sede">Emite</label>
                {sedeFija ? (
                  <p className="py-2 text-sm text-slate-700">{empresa?.nombre || SEDES_POLITICA[sede]}</p>
                ) : (
                  <select id="ce-sede" value={sede} onChange={(e) => setSede(Number(e.target.value))} className={campo}>
                    {SEDES.map((s) => (
                      <option key={s} value={s}>{SEDES_POLITICA[s]}</option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label className={etiqueta} htmlFor="ce-fecha">Fecha</label>
                <input id="ce-fecha" type="date" value={d.fecha} onChange={(e) => set("fecha", e.target.value)} className={campo} />
              </div>
              <div className="sm:col-span-2">
                <label className={etiqueta} htmlFor="ce-lugar">Lugar</label>
                <input id="ce-lugar" value={d.lugar} onChange={(e) => set("lugar", e.target.value)} className={campo} />
              </div>
            </div>
          </Bloque>

          <Bloque titulo="Cliente (de Odoo)">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder={`Buscar por nombre o ${fiscal}…`}
                aria-label="Buscar cliente en Odoo"
                className={`${campo} pl-9`}
              />
              {buscando && <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-slate-400" />}
              {clientes.length > 0 && (
                <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                  {clientes.map((c) => (
                    <li key={c.id}>
                      <button onClick={() => elegir(c)} className="w-full px-3 py-2 text-left text-sm hover:bg-blue-50">
                        <span className="font-semibold text-slate-900">{c.nombre}</span>
                        <span className="block text-xs text-slate-500">{[c.rif, c.direccion].filter(Boolean).join(" · ")}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <label className={etiqueta} htmlFor="ce-cliente">Empresa</label>
              <input id="ce-cliente" value={d.cliente} onChange={(e) => set("cliente", e.target.value)} className={campo} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={etiqueta} htmlFor="ce-rif">{fiscal}</label>
                <input id="ce-rif" value={d.rifCliente} onChange={(e) => set("rifCliente", e.target.value)} className={campo} />
              </div>
              <div>
                <label className={etiqueta} htmlFor="ce-cargo">Cargo de quien firma</label>
                <input id="ce-cargo" value={d.cargo} onChange={(e) => set("cargo", e.target.value)} placeholder="Ej. Gerente general" className={campo} />
              </div>
              <div>
                <label className={etiqueta} htmlFor="ce-rep">Representante</label>
                <input id="ce-rep" value={d.representante} onChange={(e) => set("representante", e.target.value)} className={campo} />
              </div>
              <div>
                <label className={etiqueta} htmlFor="ce-ci">Cédula</label>
                <input id="ce-ci" value={d.cedula} onChange={(e) => set("cedula", e.target.value)} className={campo} />
              </div>
            </div>
            <div>
              <label className={etiqueta} htmlFor="ce-dir">Domicilio fiscal</label>
              <textarea id="ce-dir" rows={2} value={d.direccionCliente} onChange={(e) => set("direccionCliente", e.target.value)} className={campo} />
            </div>
          </Bloque>

          <Bloque titulo="Envío">
            <div>
              <label className={etiqueta} htmlFor="ce-fact">Factura(s) / Pedido(s)</label>
              <input id="ce-fact" value={d.facturas} onChange={(e) => set("facturas", e.target.value)} placeholder="Ej. F-001234, S-05678" className={campo} />
            </div>
            <div>
              <label className={etiqueta} htmlFor="ce-dest">Destino</label>
              <textarea id="ce-dest" rows={2} value={d.destino} onChange={(e) => set("destino", e.target.value)} className={campo} />
            </div>
          </Bloque>

          <Bloque titulo="Transportista">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={etiqueta} htmlFor="ce-trans">Empresa de transporte</label>
                <input id="ce-trans" value={d.transportista} onChange={(e) => set("transportista", e.target.value)} className={campo} />
              </div>
              <div>
                <label className={etiqueta} htmlFor="ce-rift">{fiscal} del transportista</label>
                <input id="ce-rift" value={d.rifTransportista} onChange={(e) => set("rifTransportista", e.target.value)} className={campo} />
              </div>
            </div>
            <fieldset className="space-y-1 text-sm text-slate-700">
              <legend className={etiqueta}>Flete a cargo de</legend>
              <label className="flex items-center gap-2">
                <input type="radio" checked={d.flete === "cliente"} onChange={() => set("flete", "cliente")} /> El cliente
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={d.flete === "otro"} onChange={() => set("flete", "otro")} /> Otro
                {d.flete === "otro" && (
                  <input value={d.fleteOtro} onChange={(e) => set("fleteOtro", e.target.value)} aria-label="Quién paga el flete" className={`${campo} py-1`} />
                )}
              </label>
            </fieldset>
          </Bloque>

          <Bloque titulo="Condición del envío">
            <fieldset className="space-y-1 text-sm text-slate-700">
              <legend className="sr-only">Condición del envío</legend>
              <label className="flex items-center gap-2">
                <input type="radio" checked={!d.asegurado} onChange={() => set("asegurado", false)} /> No asegurado (el cliente asume el riesgo)
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={d.asegurado} onChange={() => set("asegurado", true)} /> Asegurado
              </label>
            </fieldset>
            {d.asegurado && (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="sm:col-span-3">
                  <label className={etiqueta} htmlFor="ce-aseg">Aseguradora</label>
                  <input id="ce-aseg" value={d.aseguradora} onChange={(e) => set("aseguradora", e.target.value)} className={campo} />
                </div>
                <div className="sm:col-span-2">
                  <label className={etiqueta} htmlFor="ce-pol">Póliza N.°</label>
                  <input id="ce-pol" value={d.poliza} onChange={(e) => set("poliza", e.target.value)} className={campo} />
                </div>
                <div>
                  <label className={etiqueta} htmlFor="ce-monto">Monto</label>
                  <input id="ce-monto" value={d.montoAsegurado} onChange={(e) => set("montoAsegurado", e.target.value)} className={campo} />
                </div>
              </div>
            )}
          </Bloque>
        </div>

        <div className="lg:sticky lg:top-4 lg:self-start">
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
            {/* Vista previa: el mismo HTML que se imprime; los valores van escapados en htmlCarta. */}
            <div className="min-w-[560px]" dangerouslySetInnerHTML={{ __html: htmlCarta(d, empresa) }} />
          </div>
        </div>
      </div>

    </div>
  );
}
