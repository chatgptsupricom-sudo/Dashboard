"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Aviso } from "@/components/administracion/comunes";
import { pedir } from "@/components/rotacion-inventario/comunes";
import { SEDES_ROTACION, nombreSede, type ContactoMarca } from "@/lib/rotacion-inventario/tipos";

type Form = { marca: string; companyId: number; nombre: string; correos: string; cc: string; notas: string };
const VACIO: Form = { marca: "", companyId: 0, nombre: "", correos: "", cc: "", notas: "" };

/** A quién se le escribe en cada marca (por sede, o el mismo para todas). Editan Compras y el SuperAdmin. */
export default function Contactos({ puedeEditar, marcas }: { puedeEditar: boolean; marcas: string[] }) {
  const [lista, setLista] = useState<ContactoMarca[] | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setLista((await pedir<{ contactos: ContactoMarca[] }>("/api/rotacion-inventario/contactos")).contactos);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const guardar = async () => {
    if (!form) return;
    setOcupado(true);
    setError(null);
    try {
      await pedir("/api/rotacion-inventario/contactos", { method: "PUT", body: JSON.stringify(form) });
      setForm(null);
      await cargar();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setOcupado(false);
    }
  };

  const borrar = async (c: ContactoMarca) => {
    if (!confirm(`¿Borrar el contacto de ${c.marca} (${c.companyId ? nombreSede(c.companyId) : "todas las sedes"})?`)) return;
    try {
      await pedir(`/api/rotacion-inventario/contactos?id=${c.id}`, { method: "DELETE" });
      await cargar();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const sinContacto = marcas.filter((m) => !lista?.some((c) => c.marca === m) && m !== "SIN MARCA");

  return (
    <div className="space-y-3">
      {error && <Aviso tono="rojo">{error}</Aviso>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">
          Se usan para proponer los destinatarios al enviar una solicitud. Un contacto de «Todas» sirve para las tres sedes; uno de una
          sede le gana.
        </p>
        {puedeEditar && !form && (
          <Button size="sm" onClick={() => setForm(VACIO)}>
            <Plus className="h-4 w-4 mr-2" /> Agregar contacto
          </Button>
        )}
      </div>

      {form && (
        <Card>
          <CardContent className="p-4 grid md:grid-cols-3 gap-3 text-sm">
            <label className="space-y-1">
              <span className="text-xs text-slate-500">Marca</span>
              <Input list="marcas-rotacion" value={form.marca} onChange={(e) => setForm({ ...form, marca: e.target.value.toUpperCase() })} />
              <datalist id="marcas-rotacion">
                {marcas.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </label>
            <label className="space-y-1">
              <span className="text-xs text-slate-500">Sede</span>
              <select
                className="h-9 w-full rounded-md border bg-white px-2"
                value={form.companyId}
                onChange={(e) => setForm({ ...form, companyId: Number(e.target.value) })}
              >
                <option value={0}>Todas</option>
                {SEDES_ROTACION.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs text-slate-500">Nombre del contacto</span>
              <Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="text-xs text-slate-500">Correos (separados por coma)</span>
              <Input value={form.correos} onChange={(e) => setForm({ ...form, correos: e.target.value })} />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-slate-500">Copia</span>
              <Input value={form.cc} onChange={(e) => setForm({ ...form, cc: e.target.value })} />
            </label>
            <label className="space-y-1 md:col-span-3">
              <span className="text-xs text-slate-500">Notas</span>
              <Input value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
            </label>
            <div className="md:col-span-3 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setForm(null)}>
                Cancelar
              </Button>
              <Button onClick={guardar} disabled={ocupado || !form.marca.trim() || !form.correos.trim()}>
                {ocupado && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Guardar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="bg-white">
        <CardContent className="p-0 overflow-x-auto">
          {!lista ? (
            <div className="py-10 flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Marca</th>
                  <th className="text-left px-3 py-2 font-medium">Sede</th>
                  <th className="text-left px-3 py-2 font-medium">Contacto</th>
                  <th className="text-left px-3 py-2 font-medium">Correos</th>
                  <th className="text-left px-3 py-2 font-medium">Copia</th>
                  <th className="text-left px-3 py-2 font-medium">Notas</th>
                  {puedeEditar && <th />}
                </tr>
              </thead>
              <tbody>
                {lista.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                      Todavía no hay contactos.
                    </td>
                  </tr>
                )}
                {lista.map((c) => (
                  <tr key={c.id} className="border-t">
                    <td className="px-3 py-2 font-medium">{c.marca}</td>
                    <td className="px-3 py-2">{c.companyId ? nombreSede(c.companyId) : "Todas"}</td>
                    <td className="px-3 py-2">{c.nombre ?? "—"}</td>
                    <td className="px-3 py-2">{c.correos}</td>
                    <td className="px-3 py-2">{c.cc ?? "—"}</td>
                    <td className="px-3 py-2 text-slate-500">{c.notas ?? ""}</td>
                    {puedeEditar && (
                      <td className="px-3 py-2 whitespace-nowrap text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Editar"
                          onClick={() =>
                            setForm({ marca: c.marca, companyId: c.companyId, nombre: c.nombre ?? "", correos: c.correos, cc: c.cc ?? "", notas: c.notas ?? "" })
                          }
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" aria-label="Borrar" onClick={() => borrar(c)}>
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
      {lista && sinContacto.length > 0 && (
        <p className="text-xs text-slate-500">
          Marcas con stock y sin contacto ({sinContacto.length}): {sinContacto.slice(0, 40).join(", ")}
          {sinContacto.length > 40 ? "…" : ""}
        </p>
      )}
    </div>
  );
}
