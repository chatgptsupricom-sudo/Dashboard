"use client";

import { Aviso, EstadoCarga, Tarjeta, useDatosAdmin } from "@/components/administracion/comunes";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ESTRUCTURA_GENERAL,
  ESTRUCTURAS,
  type EstadoTrabajo,
  type Nivel,
  type ProductoClasificado,
} from "@/lib/inteligencia-negocio/clasificacion/tipos";
import { ChevronDown, Pencil, Tags } from "lucide-react";
import { useMemo, useState } from "react";
import type { Columna } from "../reportes/comunes";
import { TablaReporte } from "../reportes/comunes";
import { EtiquetaNivel, PanelIA, useAvanceIA } from "./comunes";

const RUTA = "/api/inteligencia-negocio/clasificacion/productos";

type Datos = { success: true; data: { productos: ProductoClasificado[]; estado: EstadoTrabajo; hayIA: boolean } };

type Fila = Omit<ProductoClasificado, "categoria" | "subcategoria" | "nivel" | "confianza"> & {
  categoria: string;
  subcategoria: string;
  nivel: Nivel | "Sin clasificar";
  /** En %, para mostrar y para el Excel. */
  confianza: number | null;
};

const aFila = (p: ProductoClasificado): Fila => ({
  ...p,
  categoria: p.categoria ?? "",
  subcategoria: p.subcategoria ?? "",
  nivel: p.nivel ?? "Sin clasificar",
  confianza: p.confianza === null ? null : Math.round(p.confianza * 100),
});

/** Clasificación de productos: categoría + nombre corto de cada producto (lib/inteligencia-negocio/clasificacion/productos.ts). */
export function ClasificacionProductos() {
  const { datos, cargando, error, recargar } = useDatosAdmin<Datos>(RUTA, "", "");
  const { estado, empezar } = useAvanceIA(RUTA, datos?.data.estado, recargar);
  // Correcciones guardadas en esta visita: se aplican sin releer el catálogo.
  const [cambios, setCambios] = useState<Map<number, Partial<ProductoClasificado>>>(new Map());
  const [editando, setEditando] = useState<Fila | null>(null);
  const [verEstructuras, setVerEstructuras] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const filas = useMemo(
    () => (datos?.data.productos ?? []).map((p) => aFila({ ...p, ...(cambios.get(p.id) ?? {}) })),
    [datos, cambios],
  );

  const resumen = useMemo(() => {
    const n = { Alto: 0, Medio: 0, Bajo: 0, "Sin clasificar": 0 } as Record<Fila["nivel"], number>;
    for (const f of filas) n[f.nivel]++;
    return n;
  }, [filas]);

  const categorias = useMemo(() => [...new Set(filas.map((f) => f.categoria).filter(Boolean))].sort(), [filas]);

  const lanzar = async (alcance: "pendientes" | "bajos" | "todos") => {
    setAviso(null);
    const e = await empezar({ alcance });
    if (e) setAviso(e);
    else setCambios(new Map());
  };

  const columnas: Columna<Fila>[] = [
    { clave: "codigo", titulo: "Código" },
    { clave: "producto", titulo: "Producto (Odoo)", ancho: "min-w-[260px]" },
    { clave: "marca", titulo: "Marca" },
    { clave: "categoria", titulo: "Categoría" },
    { clave: "subcategoria", titulo: "Subcategoría (nombre corto)", ancho: "min-w-[240px]" },
    { clave: "confianza", titulo: "Grado de confianza", tipo: "porcentaje" },
    {
      clave: "nivel",
      titulo: "Nivel",
      mostrar: (f) => <EtiquetaNivel nivel={f.nivel === "Sin clasificar" ? null : f.nivel} manual={f.origen === "manual"} />,
    },
    { clave: "observaciones", titulo: "Observaciones / Verificar", ancho: "min-w-[220px]" },
    {
      clave: "id",
      titulo: "",
      soloPantalla: true,
      mostrar: (f) => (
        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setEditando(f)} aria-label="Corregir">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
          <Tags className="h-7 w-7 text-blue-600" />
          Clasificación de productos
        </h1>
        <p className="text-gray-500 text-sm">Categoría y nombre corto de cada producto del catálogo, con su grado de confianza</p>
      </div>

      <EstadoCarga cargando={cargando} error={error} />

      {!cargando && !error && datos && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Tarjeta titulo="Confianza alta" valor={resumen.Alto.toLocaleString("en-US")} tono="verde" detalle="Datos completos en el nombre" />
            <Tarjeta titulo="Confianza media" valor={resumen.Medio.toLocaleString("en-US")} tono="ambar" detalle="Completado por la IA: validar con la ficha" />
            <Tarjeta titulo="Confianza baja" valor={resumen.Bajo.toLocaleString("en-US")} tono="rojo" detalle="Inferido o asumido: revisar" />
            <Tarjeta
              titulo="Sin clasificar"
              valor={resumen["Sin clasificar"].toLocaleString("en-US")}
              detalle={`De ${filas.length.toLocaleString("en-US")} productos activos`}
            />
          </div>

          <PanelIA
            estado={estado}
            hayIA={datos.data.hayIA}
            texto={
              <>
                La IA lee el nombre de cada producto en Odoo y arma su nombre corto con la estructura de su categoría. Lo que
                corriges a mano queda con confianza 100 % y la IA no lo vuelve a cambiar.
              </>
            }
          >
            <Button size="sm" disabled={estado?.corriendo || resumen["Sin clasificar"] === 0} onClick={() => lanzar("pendientes")}>
              Clasificar pendientes ({resumen["Sin clasificar"].toLocaleString("en-US")})
            </Button>
            <Button size="sm" variant="outline" disabled={estado?.corriendo || resumen.Bajo === 0} onClick={() => lanzar("bajos")}>
              Reintentar confianza baja
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={estado?.corriendo}
              onClick={() => confirm("¿Reclasificar todos los productos (menos los corregidos a mano)?") && lanzar("todos")}
            >
              Reclasificar todo
            </Button>
          </PanelIA>
          {aviso && <Aviso tono="rojo">{aviso}</Aviso>}

          <div>
            <button
              onClick={() => setVerEstructuras(!verEstructuras)}
              className="flex items-center gap-1 text-sm text-blue-700 hover:underline"
            >
              <ChevronDown className={`h-4 w-4 transition-transform ${verEstructuras ? "rotate-180" : ""}`} />
              Estructura del nombre corto por categoría
            </button>
            {verEstructuras && (
              <div className="mt-2 overflow-x-auto rounded-lg border bg-white">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-left">
                    <tr>
                      <th className="px-3 py-2">Categoría</th>
                      <th className="px-3 py-2">Estructura</th>
                      <th className="px-3 py-2">Ejemplo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ESTRUCTURAS.map((e) => (
                      <tr key={e.categoria} className="border-t">
                        <td className="px-3 py-1.5 font-medium whitespace-nowrap">{e.categoria}</td>
                        <td className="px-3 py-1.5">{e.estructura}</td>
                        <td className="px-3 py-1.5 whitespace-nowrap">{e.ejemplo}</td>
                      </tr>
                    ))}
                    <tr className="border-t">
                      <td className="px-3 py-1.5 font-medium">Las demás</td>
                      <td className="px-3 py-1.5" colSpan={2}>{ESTRUCTURA_GENERAL}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <TablaReporte
            filas={filas}
            columnas={columnas}
            buscarEn={(f) => `${f.codigo} ${f.producto} ${f.subcategoria} ${f.observaciones}`}
            filtros={[
              { clave: "categoria", titulo: "Categoría" },
              { clave: "nivel", titulo: "Nivel" },
              { clave: "marca", titulo: "Marca" },
            ]}
            archivo="clasificacion-productos"
          />
        </>
      )}

      {editando && (
        <EditarProducto
          fila={editando}
          categorias={categorias}
          subcategorias={[...new Set(filas.filter((f) => f.subcategoria).map((f) => f.subcategoria))].sort()}
          onCerrar={() => setEditando(null)}
          onGuardado={(c) => {
            setCambios((m) => new Map(m).set(editando.id, c));
            setEditando(null);
          }}
        />
      )}
    </div>
  );
}

function EditarProducto({
  fila,
  categorias,
  subcategorias,
  onCerrar,
  onGuardado,
}: {
  fila: Fila;
  categorias: string[];
  subcategorias: string[];
  onCerrar: () => void;
  onGuardado: (c: Partial<ProductoClasificado>) => void;
}) {
  const [categoria, setCategoria] = useState(fila.categoria || fila.categoriaOdoo);
  const [subcategoria, setSubcategoria] = useState(fila.subcategoria);
  const [observaciones, setObservaciones] = useState(fila.observaciones);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const estructura = ESTRUCTURAS.find((e) => e.categoria === categoria.trim().toUpperCase());

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    const r = await fetch(RUTA, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: fila.id, categoria, subcategoria, observaciones }),
    }).then((x) => x.json()).catch(() => null);
    setGuardando(false);
    if (!r?.success) return setError(r?.error || "No se pudo guardar");
    onGuardado({
      categoria: categoria.trim().toUpperCase(),
      subcategoria: subcategoria.trim(),
      observaciones: observaciones.trim(),
      confianza: 1,
      nivel: "Alto",
      origen: "manual",
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Corregir clasificación</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            <p className="font-medium text-slate-800">{fila.producto}</p>
            <p>
              {fila.codigo} · {fila.marca} · Odoo: {fila.categoriaOdoo}
            </p>
          </div>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-600">Categoría</span>
            <Input value={categoria} onChange={(e) => setCategoria(e.target.value)} list="bi-categorias" />
            <datalist id="bi-categorias">
              {[...new Set([...ESTRUCTURAS.map((e) => e.categoria), ...categorias])].map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-600">Subcategoría (nombre corto)</span>
            <Input value={subcategoria} onChange={(e) => setSubcategoria(e.target.value)} list="bi-subcategorias" />
            <datalist id="bi-subcategorias">
              {subcategorias.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            <span className="block text-[11px] text-slate-500">
              {estructura ? `${estructura.estructura}. Ej.: ${estructura.ejemplo}` : ESTRUCTURA_GENERAL}
            </span>
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-600">Observaciones</span>
            <Textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={2} />
          </label>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={guardando || !categoria.trim() || !subcategoria.trim()}>
            {guardando ? "Guardando..." : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
