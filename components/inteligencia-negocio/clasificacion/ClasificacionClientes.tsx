"use client";

import { Aviso, EstadoCarga, Tarjeta, useDatosAdmin } from "@/components/administracion/comunes";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ACTIVIDADES,
  instagramValido,
  normalizarInstagram,
  type ClienteClasificado,
  type EstadoTrabajo,
  type Nivel,
} from "@/lib/inteligencia-negocio/clasificacion/tipos";
import { Instagram, Pencil, Store } from "lucide-react";
import { useMemo, useState } from "react";
import type { Columna } from "../reportes/comunes";
import { EncabezadoReporte, SelectorMeses, TablaReporte, mesesDisponibles } from "../reportes/comunes";
import { EtiquetaNivel, PanelIA, useAvanceIA } from "./comunes";

const RUTA = "/api/inteligencia-negocio/clasificacion/clientes";

type Datos = {
  success: true;
  data: { empresa: string; meses: string[]; clientes: ClienteClasificado[]; estado: EstadoTrabajo; hayIA: boolean };
};

type Fila = Omit<ClienteClasificado, "actividad" | "nivel" | "confianza"> & {
  actividad: string;
  nivel: Nivel | "Sin clasificar";
  confianza: number | null;
  compra: string;
  tipos: string;
};

const texto = (xs: { nombre: string; pct: number }[]) => xs.map((x) => `${x.nombre} ${Math.round(x.pct)}%`).join(" · ");

const aFila = (c: ClienteClasificado): Fila => ({
  ...c,
  actividad: c.actividad ?? "Sin clasificar",
  nivel: c.nivel ?? "Sin clasificar",
  confianza: c.confianza === null || !c.actividad ? null : Math.round(c.confianza * 100),
  compra: texto(c.categorias),
  tipos: texto(c.subcategorias),
});

/** Clasificación de clientes por actividad comercial (lib/inteligencia-negocio/clasificacion/clientes.ts). */
export function ClasificacionClientes() {
  const [empresa, setEmpresa] = useState("venezuela");
  const [meses, setMeses] = useState<string[]>(() => mesesDisponibles().slice(0, 3).map((m) => m.value).sort());
  const { datos, cargando, error, recargar } = useDatosAdmin<Datos>(RUTA, empresa, meses.join(","));
  const { estado, empezar } = useAvanceIA(RUTA, datos?.data.estado, recargar);
  const [cambios, setCambios] = useState<Map<number, Partial<ClienteClasificado>>>(new Map());
  const [editando, setEditando] = useState<Fila | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const filas = useMemo(
    () => (datos?.data.clientes ?? []).map((c) => aFila({ ...c, ...(cambios.get(c.id) ?? {}) })),
    [datos, cambios],
  );
  const pendientes = useMemo(() => filas.filter((f) => f.nivel === "Sin clasificar").map((f) => f.id), [filas]);
  const resumen = useMemo(() => {
    const porActividad = new Map<string, number>();
    for (const f of filas) if (f.nivel !== "Sin clasificar") porActividad.set(f.actividad, (porActividad.get(f.actividad) ?? 0) + f.ventas);
    const principal = [...porActividad.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      clasificados: filas.length - pendientes.length,
      conInstagram: filas.filter((f) => f.instagram).length,
      principal: principal?.[0] ?? "—",
    };
  }, [filas, pendientes]);

  const lanzar = async (ids: number[]) => {
    setAviso(null);
    const e = await empezar({ ids });
    if (e) setAviso(e);
    else setCambios(new Map());
  };

  const columnas: Columna<Fila>[] = [
    { clave: "rif", titulo: "RIF" },
    { clave: "cliente", titulo: "Razón social", ancho: "min-w-[220px]" },
    { clave: "zona", titulo: "Zona" },
    { clave: "ventas", titulo: "Ventas $", tipo: "dinero", sumar: true },
    { clave: "compra", titulo: "Lo que compra (categoría)", ancho: "min-w-[220px]" },
    { clave: "tipos", titulo: "Lo que compra (nombre corto)", ancho: "min-w-[260px]" },
    {
      clave: "instagram",
      titulo: "Instagram",
      mostrar: (f) =>
        f.instagram ? (
          <a href={`https://www.instagram.com/${f.instagram}/`} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">
            @{f.instagram}
          </a>
        ) : (
          <span className="text-slate-300">—</span>
        ),
      excel: (f) => (f.instagram ? `@${f.instagram}` : ""),
    },
    { clave: "actividad", titulo: "Actividad comercial", ancho: "min-w-[200px]" },
    { clave: "detalle", titulo: "Por qué", ancho: "min-w-[260px]" },
    { clave: "vendeEnRedes", titulo: "Lo que vende en redes", ancho: "min-w-[260px]" },
    { clave: "confianza", titulo: "Grado de confianza", tipo: "porcentaje" },
    {
      clave: "nivel",
      titulo: "Nivel",
      mostrar: (f) => <EtiquetaNivel nivel={f.nivel === "Sin clasificar" ? null : f.nivel} manual={f.origen === "manual"} />,
    },
    {
      clave: "id",
      titulo: "",
      soloPantalla: true,
      mostrar: (f) => (
        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setEditando(f)} aria-label="Editar">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <EncabezadoReporte
          icono={<Store className="h-7 w-7 text-blue-600" />}
          titulo="Clasificación de clientes"
          subtitulo="Actividad comercial de cada cliente: lo que te compra y lo que vende en sus redes"
          empresa={empresa}
          setEmpresa={setEmpresa}
        />
        <SelectorMeses meses={meses} setMeses={setMeses} />
      </div>

      <EstadoCarga cargando={cargando} error={error} />

      {!cargando && !error && datos && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Tarjeta titulo="Clientes que compraron" valor={filas.length.toLocaleString("en-US")} />
            <Tarjeta titulo="Clasificados" valor={resumen.clasificados.toLocaleString("en-US")} tono="verde" detalle={`${pendientes.length.toLocaleString("en-US")} sin clasificar`} />
            <Tarjeta titulo="Con Instagram anotado" valor={resumen.conInstagram.toLocaleString("en-US")} detalle="Lo anota BI: Odoo no lo tiene" />
            <Tarjeta titulo="Actividad que más compra" valor={<span className="text-base">{resumen.principal}</span>} tono="azul" />
          </div>

          <PanelIA
            estado={estado}
            hayIA={datos.data.hayIA}
            texto={
              <>
                La IA mira lo que el cliente compró en los últimos 6 meses (por categoría y nombre corto de la Clasificación de
                productos) y, si tiene Instagram anotado, su perfil y sus últimas publicaciones. Anota el Instagram con el lápiz
                antes de clasificar.
              </>
            }
          >
            <Button size="sm" disabled={estado?.corriendo || pendientes.length === 0} onClick={() => lanzar(pendientes)}>
              Clasificar pendientes ({pendientes.length.toLocaleString("en-US")})
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={estado?.corriendo || filas.length === 0}
              onClick={() =>
                confirm("¿Reclasificar a todos los clientes de la lista (menos los corregidos a mano)?") && lanzar(filas.map((f) => f.id))
              }
            >
              Reclasificar la lista
            </Button>
          </PanelIA>
          {aviso && <Aviso tono="rojo">{aviso}</Aviso>}

          <TablaReporte
            filas={filas}
            columnas={columnas}
            buscarEn={(f) => `${f.rif} ${f.cliente} ${f.instagram} ${f.compra} ${f.tipos}`}
            filtros={[
              { clave: "actividad", titulo: "Actividad" },
              { clave: "zona", titulo: "Zona" },
              { clave: "nivel", titulo: "Nivel" },
            ]}
            archivo={`clasificacion-clientes-${empresa}-${meses.join("_")}`}
            ordenInicial={{ clave: "ventas", desc: true }}
          />

          <Aviso tono="azul">
            Ventas: facturas menos notas de crédito de los meses elegidos, en USD sin IVA, sin servicios ni empresas del grupo.
            La clasificación es del cliente, no del período: se ve igual en cualquier mes. Lo corregido a mano queda con
            confianza 100 % y la IA no lo cambia. El Instagram se lee con la API de Meta: solo funciona con cuentas de
            empresa o de creador.
          </Aviso>
        </>
      )}

      {editando && (
        <EditarCliente
          fila={editando}
          corriendo={!!estado?.corriendo}
          onCerrar={() => setEditando(null)}
          onGuardado={(c, clasificar) => {
            setCambios((m) => new Map(m).set(editando.id, { ...(m.get(editando.id) ?? {}), ...c }));
            setEditando(null);
            if (clasificar) void lanzar([editando.id]);
          }}
        />
      )}
    </div>
  );
}

function EditarCliente({
  fila,
  corriendo,
  onCerrar,
  onGuardado,
}: {
  fila: Fila;
  corriendo: boolean;
  onCerrar: () => void;
  onGuardado: (c: Partial<ClienteClasificado>, clasificarConIA: boolean) => void;
}) {
  const [instagram, setInstagram] = useState(fila.instagram);
  const [actividad, setActividad] = useState(fila.origen === "manual" ? fila.actividad : "");
  const [detalle, setDetalle] = useState(fila.origen === "manual" ? fila.detalle : "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ig = normalizarInstagram(instagram);
  const igMalo = ig !== "" && !instagramValido(ig);

  const guardar = async (clasificarConIA: boolean) => {
    setGuardando(true);
    setError(null);
    const cuerpo: Record<string, unknown> = { id: fila.id, instagram: ig };
    // Con actividad elegida queda manual; vacía devuelve la clasificación a la IA.
    if (actividad || fila.origen === "manual") Object.assign(cuerpo, { actividad, detalle });
    const r = await fetch(RUTA, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    }).then((x) => x.json()).catch(() => null);
    setGuardando(false);
    if (!r?.success) return setError(r?.error || "No se pudo guardar");
    const cambio: Partial<ClienteClasificado> = { instagram: ig };
    if (actividad) Object.assign(cambio, { actividad, detalle, confianza: 1, nivel: "Alto", origen: "manual" });
    else if (fila.origen === "manual") Object.assign(cambio, { actividad: null, detalle: "", confianza: null, nivel: null, origen: null });
    onGuardado(cambio, clasificarConIA && !actividad);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{fila.cliente}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            {fila.rif} · {fila.zona}
            {fila.compra && (
              <>
                <br />
                Compra: {fila.compra}
              </>
            )}
          </p>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-600 flex items-center gap-1">
              <Instagram className="h-3.5 w-3.5" /> Instagram del cliente
            </span>
            <Input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@usuario o enlace del perfil" />
            {igMalo && <span className="text-[11px] text-red-600">Usuario inválido</span>}
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-600">Actividad comercial</span>
            <select
              value={actividad}
              onChange={(e) => setActividad(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="">— La clasifica la IA —</option>
              {ACTIVIDADES.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <span className="block text-[11px] text-slate-500">Si la eliges a mano, queda con confianza 100 % y la IA no la cambia.</span>
          </label>
          {actividad && (
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-600">Por qué</span>
              <Textarea value={detalle} onChange={(e) => setDetalle(e.target.value)} rows={2} />
            </label>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          {!actividad && (
            <Button variant="outline" onClick={() => guardar(true)} disabled={guardando || igMalo || corriendo}>
              Guardar y clasificar con IA
            </Button>
          )}
          <Button onClick={() => guardar(false)} disabled={guardando || igMalo}>
            {guardando ? "Guardando..." : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
