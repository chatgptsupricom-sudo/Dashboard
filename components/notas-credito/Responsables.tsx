"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DESCRIPCION_PASO,
  ETIQUETA_PASO,
  flujoCompleto,
  NOMBRE_SEDE,
  PASOS,
  SEDES,
  type PasoNC,
  type UsuarioPanel,
} from "@/lib/notas-credito/tipos";
import { Check, Loader2, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type Pasos = Record<PasoNC, string[]>;
type Datos = { aprobadores: Record<number, Pasos>; usuarios: UsuarioPanel[] };

const vacio = (): Pasos => ({ rma: [], preaprueba: [], aprueba: [], procesa: [] });
const iguales = (a: Pasos, b: Pasos) => PASOS.every((p) => [...a[p]].sort().join() === [...b[p]].sort().join());

/** Uno o varios usuarios del panel (users_config) para un paso. */
function SelectorUsuarios({
  elegidos,
  usuarios,
  onCambio,
  opcional = false,
}: {
  elegidos: string[];
  usuarios: UsuarioPanel[];
  onCambio: (correos: string[]) => void;
  opcional?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const porCorreo = useMemo(() => new Map(usuarios.map((u) => [u.email, u])), [usuarios]);
  const alternar = (email: string) =>
    onCambio(elegidos.includes(email) ? elegidos.filter((e) => e !== email) : [...elegidos, email]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {elegidos.map((email) => {
          const u = porCorreo.get(email);
          return (
            <span
              key={email}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${u ? "border-slate-200 bg-slate-50 text-slate-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}
              title={email}
            >
              {u ? u.nombre : `${email} (no es usuario del panel)`}
              <button type="button" onClick={() => alternar(email)} className="text-slate-400 hover:text-rose-600" aria-label="Quitar">
                <X className="h-3 w-3" />
              </button>
            </span>
          );
        })}
        {!elegidos.length &&
          (opcional ? (
            <span className="text-xs text-slate-400">Nadie: los avisos van solo a quien hizo la solicitud.</span>
          ) : (
            <span className="text-xs text-rose-600">Nadie: el flujo de esta sede no está activo.</span>
          ))}
      </div>
      <Popover open={abierto} onOpenChange={setAbierto}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="h-8 text-xs">
            <Plus className="mr-1 h-3.5 w-3.5" /> Agregar persona
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">
          <Command
            filter={(valor, busqueda) => (valor.toLowerCase().includes(busqueda.toLowerCase().trim()) ? 1 : 0)}
          >
            <CommandInput placeholder="Nombre, correo o rol" />
            <CommandList>
              <CommandEmpty>Sin usuarios que coincidan.</CommandEmpty>
              <CommandGroup>
                {usuarios.map((u) => (
                  <CommandItem key={u.email} value={`${u.nombre} ${u.email} ${u.rol}`} onSelect={() => alternar(u.email)}>
                    <Check className={`mr-2 h-4 w-4 shrink-0 ${elegidos.includes(u.email) ? "opacity-100" : "opacity-0"}`} />
                    <span className="min-w-0">
                      <span className={`block truncate text-sm ${u.activo ? "" : "text-slate-400 line-through"}`}>{u.nombre}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {u.email}
                        {u.rol ? ` · ${u.rol}` : ""}
                        {u.cids && NOMBRE_SEDE[u.cids] ? ` · ${NOMBRE_SEDE[u.cids]}` : ""}
                      </span>
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/**
 * SuperAdmin: quién preaprueba, aprueba y hace la nota en cada sede. Se eligen
 * de los usuarios del panel (users_config), uno o varios por paso. Una sede
 * con los tres pasos cubiertos tiene el flujo activo; si no, las solicitudes
 * de RMA de esa sede le llegan al Super Admin, como antes.
 */
export function Responsables() {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [borrador, setBorrador] = useState<Record<number, Pasos>>({});
  const [guardando, setGuardando] = useState<number | null>(null);
  const [mensaje, setMensaje] = useState<Record<number, { ok: boolean; texto: string }>>({});
  const [error, setError] = useState("");

  const cargar = async () => {
    try {
      const r = await fetch("/api/notas-credito/aprobadores");
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "No se pudo cargar");
      setDatos(j);
      setBorrador(Object.fromEntries(SEDES.map((s) => [s, { ...vacio(), ...(j.aprobadores[s] ?? {}) }])));
    } catch (e: any) {
      setError(e?.message || "No se pudo cargar");
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const guardar = async (sede: number) => {
    setGuardando(sede);
    setMensaje((m) => ({ ...m, [sede]: { ok: true, texto: "" } }));
    try {
      const r = await fetch("/api/notas-credito/aprobadores", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: sede, pasos: borrador[sede] }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "No se pudo guardar");
      setMensaje((m) => ({ ...m, [sede]: { ok: true, texto: "Guardado." } }));
      await cargar();
    } catch (e: any) {
      setMensaje((m) => ({ ...m, [sede]: { ok: false, texto: e?.message || "No se pudo guardar" } }));
    } finally {
      setGuardando(null);
    }
  };

  if (error) return <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>;
  if (!datos) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-7 w-7 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        El flujo es el mismo en las tres sedes; cambian las personas. Se eligen de los usuarios del panel, una o varias por paso, y los
        avisos les llegan a su correo. El SuperAdmin ve todo, pero solo decide quien esté aquí.
      </p>
      {SEDES.map((sede) => {
        const actual = borrador[sede] ?? vacio();
        const guardado = { ...vacio(), ...(datos.aprobadores[sede] ?? {}) };
        const cambios = !iguales(actual, guardado);
        return (
          <div key={sede} className="space-y-4 rounded-3xl bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-bold text-slate-900">{NOMBRE_SEDE[sede]}</h3>
              {flujoCompleto(guardado) ? (
                <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-700">Flujo activo</Badge>
              ) : (
                <Badge className="border border-slate-200 bg-slate-50 text-slate-500">
                  Sin flujo: falta gente en preaprueba, aprueba o hace la nota (RMA le pide al Super Admin)
                </Badge>
              )}
            </div>
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
              {PASOS.map((p) => (
                <div key={p} className="space-y-1.5">
                  <p className="text-sm font-semibold text-slate-800">{ETIQUETA_PASO[p]}</p>
                  <p className="text-xs text-slate-500">{DESCRIPCION_PASO[p]}</p>
                  <SelectorUsuarios
                    opcional={p === "rma"}
                    elegidos={actual[p]}
                    usuarios={datos.usuarios}
                    onCambio={(correos) => setBorrador((b) => ({ ...b, [sede]: { ...actual, [p]: correos } }))}
                  />
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm" disabled={guardando === sede || !cambios} onClick={() => guardar(sede)}>
                {guardando === sede && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Guardar {NOMBRE_SEDE[sede]}
              </Button>
              {cambios && (
                <button
                  type="button"
                  className="text-xs text-slate-500 hover:underline"
                  onClick={() => setBorrador((b) => ({ ...b, [sede]: guardado }))}
                >
                  Deshacer cambios
                </button>
              )}
              {mensaje[sede]?.texto && (
                <span className={`text-sm ${mensaje[sede].ok ? "text-emerald-700" : "text-rose-700"}`}>{mensaje[sede].texto}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
