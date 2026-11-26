"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, Check, Clock, Copy, ExternalLink, MapPin, Phone, RefreshCw, Search, Store, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Aviso, EstadoCarga, Pestanas, Tarjeta } from "@/components/administracion/comunes";
import type { CambioPerfil, PerfilPanel } from "@/lib/tienda-web/clientes/perfilesPanel";

/**
 * Perfiles de clientes (lib/tienda-web/clientes/perfilesPanel.ts): lo que cada cliente escribió en «Mi cuenta»
 * de la tienda web —nombre, logo, redes, razones sociales con RIF y sucursales—, para que su vendedor lo vea y
 * actualice Odoo. Solo lee: el cliente es quien lo edita.
 */

const SEDES = [
  { value: "", label: "Todas las sedes" },
  { value: "9", label: "Valencia" },
  { value: "10", label: "Caracas" },
  { value: "7", label: "Panamá" },
];
const REDES: Record<string, string> = { instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", x: "X", linkedin: "LinkedIn", web: "Página web" };
type Filtro = "todos" | "confirmar";

const sinAcentos = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const fechaHora = (t: string) => {
  if (!t) return "—";
  const [d, h] = t.split(" ");
  const [a, m, dia] = d.split("-");
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${Number(dia)} ${meses[Number(m) - 1]} ${a}${h ? ` · ${h}` : ""}`;
};
const iniciales = (t: string) => t.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "C";
const textoRed = (id: string, url: string) => {
  try {
    const u = new URL(url);
    if (id === "web") return (u.host + u.pathname).replace(/\/$/, "");
    return `@${(u.pathname.split("/").filter(Boolean).pop() || u.host).replace(/^@/, "")}`;
  } catch {
    return url;
  }
};

function Logo({ p, tam = 48 }: { p: Pick<PerfilPanel, "clave" | "nombre" | "tieneLogo" | "version">; tam?: number }) {
  const [fallo, setFallo] = useState(false);
  const estilo = { width: tam, height: tam };
  if (p.tieneLogo && !fallo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/perfiles-clientes/logo?clave=${encodeURIComponent(p.clave)}&v=${p.version}`}
        alt={`Logo de ${p.nombre}`}
        onError={() => setFallo(true)}
        className="shrink-0 rounded-xl border bg-white object-contain p-1"
        style={estilo}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-700 to-slate-900 font-bold text-white"
      style={{ ...estilo, fontSize: tam * 0.34 }}
    >
      {iniciales(p.nombre)}
    </span>
  );
}

function Registro({ registrada }: { registrada: boolean }) {
  return registrada ? (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
      <Check className="h-3 w-3" /> En Odoo
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
      <Clock className="h-3 w-3" /> No está en Odoo
    </span>
  );
}

/** Cómo quedó el paso automático del perfil a Odoo. */
function EstadoOdoo({ odoo, detalle = false }: { odoo: PerfilPanel["odoo"]; detalle?: boolean }) {
  const estilos: Record<string, [string, string]> = {
    ok: ["border-emerald-200 bg-emerald-50 text-emerald-700", "En Odoo"],
    error: ["border-red-200 bg-red-50 text-red-700", "No pasó a Odoo"],
    pendiente: ["border-blue-200 bg-blue-50 text-blue-700", "Pasando a Odoo"],
    sin_fichas: ["border-slate-200 bg-slate-50 text-slate-600", "Sin ficha en Odoo"],
    apagado: ["border-slate-200 bg-slate-50 text-slate-600", "Paso a Odoo apagado"],
  };
  const [clase, texto] = estilos[odoo.estado] || estilos.pendiente;
  const insignia = (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${clase}`}>
      {odoo.estado === "ok" ? <Check className="h-3 w-3" /> : odoo.estado === "pendiente" ? <RefreshCw className="h-3 w-3" /> : null}
      {texto}
    </span>
  );
  if (!detalle) return insignia;
  return (
    <div className="space-y-1 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {insignia}
        {odoo.sincronizado && <span className="text-xs text-muted-foreground">Última vez: {fechaHora(odoo.sincronizado)}</span>}
      </div>
      {odoo.estado === "ok" && (odoo.creadas + odoo.actualizadas + odoo.archivadas > 0) && (
        <p className="text-xs text-muted-foreground">
          Direcciones de entrega: {odoo.creadas} creadas, {odoo.actualizadas} actualizadas, {odoo.archivadas} archivadas. Cada cambio queda anotado en el
          historial de la ficha en Odoo.
        </p>
      )}
      {odoo.estado === "error" && <p className="text-xs text-red-700">{odoo.error} Se reintenta solo cada hora.</p>}
      {odoo.estado === "apagado" && (
        <p className="text-xs text-muted-foreground">
          Lo guardado no pasó a Odoo porque el paso automático está apagado para este cliente (variable TIENDA_PERFIL_ODOO). Pasa solo, en la
          siguiente hora, cuando se prenda.
        </p>
      )}
      {odoo.sinOdoo.length > 0 && (
        <p className="text-xs text-amber-800">
          No se crean solas en Odoo (su RIF no está en una ficha de este cliente): {odoo.sinOdoo.join(", ")}. Créalas en Odoo y sus sucursales pasan en el
          próximo guardado o en la próxima hora.
        </p>
      )}
    </div>
  );
}

const NOMBRE_SEDE: Record<number, string> = { 9: "Valencia", 10: "Caracas", 7: "Panamá" };
const TIPO_OP: Record<string, [string, string]> = {
  crear: ["bg-emerald-100 text-emerald-800", "Crear"],
  adoptar: ["bg-blue-100 text-blue-800", "Usar la que ya existe"],
  actualizar: ["bg-blue-100 text-blue-800", "Actualizar"],
  archivar: ["bg-amber-100 text-amber-800", "Archivar"],
};
interface VistaPrevia {
  activo: boolean;
  fichas: { id: number; company: number; direcciones: number }[];
  operaciones: { tipo: string; company: number; partnerId: number | null; texto: string; vals: { street: string; phone: string; partner_latitude: number; partner_longitude: number } | null }[];
  empresa: { company: number; partnerId: number; web: string; logo: boolean }[];
  sinOdoo: string[];
}

/** Solo SuperAdmin: lo que el paso automático haría en Odoo con este perfil, sin escribir nada. */
function VistaPreviaOdoo({ clave }: { clave: string }) {
  const [v, setV] = useState<VistaPrevia | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [oculto, setOculto] = useState(false);
  useEffect(() => {
    setV(null);
    setError(null);
    fetch(`/api/perfiles-clientes/odoo?clave=${encodeURIComponent(clave)}`, { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 401 || r.status === 403) { setOculto(true); return; }
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || "No pudimos leer Odoo");
        setV(j);
      })
      .catch((e) => setError(e.message));
  }, [clave]);
  if (oculto) return null;
  return (
    <section className="space-y-2 rounded-lg border border-dashed p-3">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Qué haría en Odoo (vista previa)</h3>
      {error && <p className="text-xs text-red-700">{error}</p>}
      {!v && !error && <p className="text-xs text-muted-foreground">Leyendo Odoo…</p>}
      {v && (
        <div className="space-y-2 text-sm">
          <p className={`text-xs font-medium ${v.activo ? "text-emerald-700" : "text-slate-600"}`}>
            {v.activo
              ? "El paso automático está prendido para este cliente: esto se hace al guardar o en la siguiente hora."
              : "El paso automático está apagado para este cliente: no se escribe nada en Odoo. Esto es lo que haría al prenderlo."}
          </p>
          <p className="text-xs text-muted-foreground">
            Fichas del cliente en Odoo:{" "}
            {v.fichas.length
              ? v.fichas.map((f) => `${NOMBRE_SEDE[f.company] || f.company} #${f.id} (${f.direcciones} direcciones de entrega)`).join(" · ")
              : "ninguna"}
          </p>
          {v.operaciones.length || v.empresa.length ? (
            <ul className="space-y-1.5">
              {v.operaciones.map((o, i) => (
                <li key={i} className="rounded-md bg-slate-50 px-2.5 py-1.5">
                  <span className={`mr-2 rounded px-1.5 py-0.5 text-[11px] font-semibold ${TIPO_OP[o.tipo]?.[0] || ""}`}>{TIPO_OP[o.tipo]?.[1] || o.tipo}</span>
                  <span className="text-xs text-muted-foreground">{NOMBRE_SEDE[o.company] || o.company}{o.partnerId ? ` · #${o.partnerId}` : ""} — </span>
                  <span className="text-xs">{o.texto.replace(/^se /, "")}</span>
                  {o.vals && (
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {o.vals.street} · {o.vals.phone}
                      {o.vals.partner_latitude ? ` · ${o.vals.partner_latitude}, ${o.vals.partner_longitude}` : ""}
                    </p>
                  )}
                </li>
              ))}
              {v.empresa.map((e) => (
                <li key={`e-${e.partnerId}`} className="rounded-md bg-slate-50 px-2.5 py-1.5 text-xs">
                  <span className="mr-2 rounded bg-blue-100 px-1.5 py-0.5 text-[11px] font-semibold text-blue-800">Actualizar ficha</span>
                  {NOMBRE_SEDE[e.company] || e.company} #{e.partnerId} — {[e.web ? `página web ${e.web}` : "", e.logo ? "logo" : ""].filter(Boolean).join(" y ")}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">Nada que hacer: Odoo ya tiene lo que guardó el cliente.</p>
          )}
          {v.sinOdoo.length > 0 && <p className="text-xs text-amber-800">No se crean (no están en Odoo): {v.sinOdoo.join(", ")}.</p>}
        </div>
      )}
    </section>
  );
}

function BotonCopiar({ texto, etiqueta }: { texto: string; etiqueta: string }) {
  const [listo, setListo] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-7 gap-1 px-2 text-xs"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
          setListo(true);
          setTimeout(() => setListo(false), 1500);
        } catch {
          /* sin portapapeles */
        }
      }}
      aria-label={etiqueta}
    >
      {listo ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {listo ? "Copiado" : "Copiar"}
    </Button>
  );
}

function Detalle({ clave, sede, onCerrar }: { clave: string | null; sede: string; onCerrar: () => void }) {
  const [perfil, setPerfil] = useState<(PerfilPanel & { historial: CambioPerfil[] }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!clave) return;
    setPerfil(null);
    setError(null);
    const q = new URLSearchParams({ clave });
    if (sede) q.set("sede", sede);
    fetch(`/api/perfiles-clientes?${q}`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || "No pudimos leer el perfil");
        setPerfil(j.perfil);
      })
      .catch((e) => setError(e.message));
  }, [clave, sede]);

  return (
    <Sheet open={Boolean(clave)} onOpenChange={(abierto) => !abierto && onCerrar()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader className="text-left">
          <SheetTitle className="sr-only">Perfil del cliente</SheetTitle>
          <SheetDescription className="sr-only">Lo que el cliente escribió en Mi cuenta de la tienda web</SheetDescription>
        </SheetHeader>
        {error && <Aviso tono="rojo">{error}</Aviso>}
        {!perfil && !error && <EstadoCarga cargando error={null} texto="Leyendo el perfil..." />}
        {perfil && (
          <div className="space-y-6 px-1 pb-8">
            <div className="flex items-center gap-4">
              <Logo p={perfil} tam={72} />
              <div className="min-w-0">
                <h2 className="text-xl font-bold leading-tight">{perfil.nombre}</h2>
                <p className="text-sm text-muted-foreground">
                  {perfil.razones.length} {perfil.razones.length === 1 ? "razón social" : "razones sociales"} · {perfil.sucursales}{" "}
                  {perfil.sucursales === 1 ? "sucursal" : "sucursales"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Actualizado el {fechaHora(perfil.actualizadoEl)}
                  {perfil.actualizadoPor ? ` por ${perfil.actualizadoPor}` : ""}
                </p>
              </div>
            </div>

            {perfil.porConfirmar > 0 && (
              <Aviso>
                {perfil.porConfirmar === 1 ? "Una razón social no está" : `${perfil.porConfirmar} razones sociales no están`} en Odoo con ese RIF.
                Sus sucursales no pasan a Odoo hasta que exista: revísala con el cliente y, si corresponde, créala o corrige el RIF en Odoo.
              </Aviso>
            )}

            <section className="space-y-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">En Odoo</h3>
              <EstadoOdoo odoo={perfil.odoo} detalle />
              <VistaPreviaOdoo clave={perfil.clave} />
              {perfil.enOdoo.length ? (
                <ul className="flex flex-wrap gap-2">
                  {perfil.enOdoo.map((o) => (
                    <li key={o.partnerId} className="rounded-lg border bg-slate-50 px-3 py-1.5 text-sm">
                      <span className="font-medium">{o.sede}</span> · {o.vendedor || "sin vendedor"}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No encontramos una ficha de empresa con su RIF.</p>
              )}
            </section>

            {Object.keys(perfil.redes).length > 0 && (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Redes sociales</h3>
                <ul className="flex flex-wrap gap-2">
                  {Object.entries(perfil.redes).map(([id, url]) => (
                    <li key={id}>
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm hover:bg-slate-50"
                      >
                        <span className="text-muted-foreground">{REDES[id] || id}</span>
                        <span className="font-medium">{textoRed(id, url!)}</span>
                        <ExternalLink className="h-3 w-3 text-muted-foreground" />
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Razones sociales y sucursales</h3>
              {perfil.razones.map((r) => (
                <Card key={r.rif} className="overflow-hidden">
                  <div className="flex flex-wrap items-start justify-between gap-2 border-b bg-slate-50/70 px-4 py-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-semibold">
                        <Building2 className="h-4 w-4 text-muted-foreground" /> {r.razon}
                      </p>
                      <p className="font-mono text-xs text-muted-foreground">{r.rif}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Registro registrada={r.registrada} />
                      <BotonCopiar
                        etiqueta={`Copiar los datos de ${r.razon}`}
                        texto={[
                          `${r.razon} — ${r.rif}`,
                          ...r.sucursales.map(
                            (s) =>
                              `• ${s.nombre}: ${s.direccion}. Contacto: ${s.contacto}, ${s.telefono}` +
                              (typeof s.lat === "number" ? `. Mapa: https://www.google.com/maps?q=${s.lat},${s.lng}` : ""),
                          ),
                        ].join("\n")}
                      />
                    </div>
                  </div>
                  <CardContent className="grid gap-3 p-4 sm:grid-cols-2">
                    {r.sucursales.map((s, i) => (
                      <div key={`${s.nombre}-${i}`} className="space-y-1 rounded-lg border p-3 text-sm">
                        <p className="flex items-center gap-1.5 font-medium">
                          <Store className="h-3.5 w-3.5 text-muted-foreground" /> {s.nombre}
                        </p>
                        <p className="flex gap-1.5 text-muted-foreground">
                          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {s.direccion}
                        </p>
                        {typeof s.lat === "number" && (
                          <a
                            href={`https://www.google.com/maps?q=${s.lat},${s.lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-5 inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline"
                          >
                            Ver en el mapa <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                        <p className="flex items-center gap-1.5 text-muted-foreground">
                          <User className="h-3.5 w-3.5" /> {s.contacto}
                        </p>
                        <p className="flex items-center gap-1.5">
                          <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                          <a className="font-medium hover:underline" href={`tel:${s.telefono.replace(/[^\d+]/g, "")}`}>
                            {s.telefono}
                          </a>
                        </p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Historial de cambios</h3>
              {perfil.historial.length ? (
                <ol className="relative space-y-4 border-l pl-5">
                  {perfil.historial.map((h) => (
                    <li key={`${h.version}-${h.el}`} className="relative">
                      <span className="absolute -left-[25px] top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-blue-600 ring-1 ring-blue-200" />
                      <p className="text-xs text-muted-foreground">
                        {fechaHora(h.el)} · {h.por}
                      </p>
                      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm">
                        {h.cambios.map((c, i) => (
                          <li key={i}>{c}</li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">Sin cambios registrados.</p>
              )}
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default function PantallaPerfiles() {
  const [perfiles, setPerfiles] = useState<PerfilPanel[] | null>(null);
  const [eligeSede, setEligeSede] = useState(false);
  const [alcance, setAlcance] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<{ mensaje: string; odooCaido: boolean } | null>(null);
  const [sede, setSede] = useState("");
  const [buscar, setBuscar] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [abierto, setAbierto] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const r = await fetch(`/api/perfiles-clientes${sede ? `?sede=${sede}` : ""}`, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw Object.assign(new Error(j.error || "No pudimos leer los perfiles"), { odooCaido: Boolean(j.odooCaido) });
      setPerfiles(j.perfiles);
      setEligeSede(Boolean(j.eligeSede));
      setAlcance(j.alcance || "");
    } catch (e: any) {
      setError({ mensaje: e.message, odooCaido: Boolean(e.odooCaido) });
    } finally {
      setCargando(false);
    }
  }, [sede]);
  useEffect(() => {
    cargar();
  }, [cargar]);

  const porConfirmar = (perfiles || []).filter((p) => p.porConfirmar > 0).length;
  const visibles = useMemo(() => {
    const q = sinAcentos(buscar.trim());
    const qRif = buscar.toUpperCase().replace(/[^A-Z0-9]/g, "");
    return (perfiles || []).filter((p) => {
      if (filtro === "confirmar" && !p.porConfirmar) return false;
      if (!q) return true;
      const texto = sinAcentos(
        [p.nombre, ...p.razones.flatMap((r) => [r.razon, ...r.sucursales.flatMap((s) => [s.nombre, s.contacto, s.direccion])]), ...p.enOdoo.map((o) => o.vendedor)].join(" "),
      );
      return texto.includes(q) || (qRif.length >= 4 && p.razones.some((r) => r.rif.replace(/[^A-Z0-9]/gi, "").toUpperCase().includes(qRif)));
    });
  }, [perfiles, buscar, filtro]);

  const sucursales = (perfiles || []).reduce((a, p) => a + p.sucursales, 0);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Perfiles de clientes</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Lo que cada cliente escribió de su empresa en «Mi cuenta» de la tienda web: razones sociales con su RIF, sucursales con
            dirección y contacto, redes y logo.{" "}
            {alcance === "vendedor" ? "Ves los clientes que tienes asignados en Odoo." : alcance === "sede" ? "Ves los clientes de tu sede." : ""}{" "}
            Lo que el cliente guarda pasa solo a Odoo como direcciones de entrega de su ficha (con su ubicación), junto con su página web y su logo.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {eligeSede && (
            <select
              value={sede}
              onChange={(e) => setSede(e.target.value)}
              className="h-9 rounded-md border bg-background px-3 text-sm"
              aria-label="Sede"
            >
              {SEDES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          )}
          <Button variant="outline" size="sm" onClick={cargar} disabled={cargando} className="gap-1.5">
            <RefreshCw className={`h-4 w-4 ${cargando ? "animate-spin" : ""}`} /> Actualizar
          </Button>
        </div>
      </div>

      <EstadoCarga cargando={cargando && !perfiles} error={error} texto="Leyendo los perfiles y Odoo..." />

      {perfiles && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Tarjeta titulo="Clientes con perfil" valor={String(perfiles.length)} detalle="Lo guardaron en Mi cuenta" />
            <Tarjeta titulo="Sucursales" valor={String(sucursales)} detalle="Entre todas sus razones sociales" />
            <Tarjeta
              titulo="Con razones por revisar"
              valor={String(porConfirmar)}
              detalle="Su RIF no está en Odoo"
              tono={porConfirmar ? "ambar" : "verde"}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Pestanas<Filtro>
              opciones={[
                { value: "todos", label: "Todos", contador: perfiles.length },
                { value: "confirmar", label: "Por revisar en Odoo", contador: porConfirmar },
              ]}
              valor={filtro}
              onChange={setFiltro}
            />
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={buscar}
                onChange={(e) => setBuscar(e.target.value)}
                placeholder="Cliente, razón social, RIF, contacto…"
                className="pl-9"
                aria-label="Buscar perfiles"
              />
            </div>
          </div>

          {visibles.length ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {visibles.map((p) => (
                <button
                  key={p.clave}
                  type="button"
                  onClick={() => setAbierto(p.clave)}
                  className="group rounded-xl border bg-card p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-400 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <div className="flex items-start gap-3">
                    <Logo p={p} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{p.nombre}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.razones.length} {p.razones.length === 1 ? "razón social" : "razones sociales"} · {p.sucursales}{" "}
                        {p.sucursales === 1 ? "sucursal" : "sucursales"}
                      </p>
                      <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{p.razones.map((r) => r.rif).join(" · ")}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    {p.enOdoo.slice(0, 3).map((o) => (
                      <span key={o.partnerId} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">
                        {o.sede}
                        {o.vendedor ? ` · ${o.vendedor}` : ""}
                      </span>
                    ))}
                    {!p.enOdoo.length && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">Sin ficha en Odoo</span>}
                    <EstadoOdoo odoo={p.odoo} />
                    {p.porConfirmar > 0 && (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                        {p.porConfirmar} por revisar
                      </span>
                    )}
                  </div>
                  <p className="mt-3 text-[11px] text-muted-foreground">Actualizado el {fechaHora(p.actualizadoEl)}</p>
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
              {perfiles.length
                ? "Ningún perfil coincide con la búsqueda."
                : "Todavía ningún cliente tuyo guardó su perfil en Mi cuenta de la tienda web."}
            </div>
          )}
        </>
      )}

      <Detalle clave={abierto} sede={sede} onCerrar={() => setAbierto(null)} />
    </div>
  );
}
