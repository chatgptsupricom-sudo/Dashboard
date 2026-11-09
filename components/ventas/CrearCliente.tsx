"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  revisarEmail,
  revisarRif,
  revisarTelefono,
  sugerirComercial,
  validarCliente,
  type ClienteNuevo,
  type Errores,
  type TipoCliente,
} from "@/lib/clientes-odoo/validar";
import { AlertTriangle, Building2, CheckCircle2, ExternalLink, Loader2, UserPlus, UserRound } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type Opcion = { id: number; nombre: string };
type Coincidencia = { id: number; nombre: string; comercial: string; rif: string; sede: number | null; sedeNombre: string; vendedor: string; url: string };
type Clave = keyof ClienteNuevo;

const VACIO = {
  tipo: "empresa" as TipoCliente,
  rif: "",
  nombre: "",
  comercial: "",
  telefono: "",
  telefono2: "",
  email: "",
  direccion: "",
  ciudad: "",
  estadoId: "",
  vendedorId: "",
};
type Form = typeof VACIO;

/**
 * Crear un cliente de Valencia o Caracas en Odoo con validación de RIF
 * (dígito verificador), teléfono y correo, y el nombre comercial en
 * «Referencia» (lib/clientes-odoo). Por ahora la usa el Asistente de Ventas.
 */
export function CrearCliente() {
  const [form, setForm] = useState<Form>(VACIO);
  const [comercialTocado, setComercialTocado] = useState(false);
  const [tocados, setTocados] = useState<Partial<Record<Clave, boolean>>>({});
  const [erroresServidor, setErroresServidor] = useState<Errores>({});
  const [sede, setSede] = useState<number | null>(null);
  const [sedeFija, setSedeFija] = useState(true);
  const [sedes, setSedes] = useState<Opcion[]>([]);
  const [estados, setEstados] = useState<Opcion[]>([]);
  const [vendedores, setVendedores] = useState<Opcion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorGeneral, setErrorGeneral] = useState("");
  const [coincidencias, setCoincidencias] = useState<Coincidencia[] | null>(null);
  const [buscandoRif, setBuscandoRif] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [creado, setCreado] = useState<{ id: number; url: string; nombre: string } | null>(null);

  const cargar = useCallback(async (s?: number) => {
    setCargando(true);
    setErrorGeneral("");
    try {
      const r = await fetch(`/api/ventas/clientes${s ? `?sede=${s}` : ""}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "No se pudo cargar");
      setSede(d.sede);
      setSedeFija(d.sedeFija);
      setSedes(d.sedes);
      setEstados(d.estados);
      setVendedores(d.vendedores);
    } catch (e: any) {
      setErrorGeneral(e.message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const { errores } = validarCliente({ ...form, sede: sede ?? 0, estadoId: Number(form.estadoId), vendedorId: Number(form.vendedorId) });
  const errorDe = (c: Clave) => erroresServidor[c] || (tocados[c] ? errores[c] : undefined);
  const tocar = (c: Clave) => setTocados((t) => ({ ...t, [c]: true }));

  const poner = (c: keyof Form, v: string) => {
    setForm((f) => {
      const n = { ...f, [c]: v };
      if (c === "nombre" && !comercialTocado) n.comercial = sugerirComercial(v);
      return n;
    });
    setErroresServidor((e) => ({ ...e, [c]: undefined }));
    if (c === "comercial") setComercialTocado(true);
    if (c === "rif" || c === "tipo") setCoincidencias(null);
  };

  const buscarRif = async () => {
    tocar("rif");
    if (!revisarRif(form.rif, form.tipo).ok) return;
    setBuscandoRif(true);
    try {
      const r = await fetch(`/api/ventas/clientes?rif=${encodeURIComponent(form.rif)}${sede ? `&sede=${sede}` : ""}`);
      const d = await r.json();
      if (r.ok) setCoincidencias(d.coincidencias);
    } finally {
      setBuscandoRif(false);
    }
  };

  const enEstaSede = (coincidencias || []).filter((c) => c.sede === sede || c.sede === null);
  const enOtra = (coincidencias || []).filter((c) => c.sede !== sede && c.sede !== null);

  const guardar = async () => {
    setTocados(Object.fromEntries(Object.keys(VACIO).map((k) => [k, true])));
    if (Object.keys(errores).length || enEstaSede.length) return;
    setGuardando(true);
    setErrorGeneral("");
    try {
      const r = await fetch("/api/ventas/clientes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, sede, estadoId: Number(form.estadoId), vendedorId: Number(form.vendedorId) }),
      });
      const d = await r.json();
      if (r.status === 409) return setCoincidencias(d.coincidencias);
      if (!r.ok) {
        setErroresServidor(d.errores || {});
        throw new Error(d.error || "No se pudo crear");
      }
      setCreado({ id: d.id, url: d.url, nombre: form.nombre.toUpperCase() });
    } catch (e: any) {
      setErrorGeneral(e.message);
    } finally {
      setGuardando(false);
    }
  };

  const otro = () => {
    setForm(VACIO);
    setComercialTocado(false);
    setTocados({});
    setErroresServidor({});
    setCoincidencias(null);
    setCreado(null);
  };

  if (creado) {
    return (
      <Card className="mx-auto max-w-xl">
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          <CheckCircle2 className="h-12 w-12 text-green-600" />
          <div>
            <p className="text-lg font-semibold">Cliente creado en Odoo</p>
            <p className="text-muted-foreground">{creado.nombre}</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild variant="outline">
              <a href={creado.url} target="_blank" rel="noreferrer">
                Abrir ficha en Odoo <ExternalLink className="ml-2 h-4 w-4" />
              </a>
            </Button>
            <Button onClick={otro}>
              <UserPlus className="mr-2 h-4 w-4" /> Crear otro cliente
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const rifVista = form.rif && revisarRif(form.rif, form.tipo).ok ? revisarRif(form.rif, form.tipo).valor : "";
  const telVista = (v: string) => (v && revisarTelefono(v).ok ? revisarTelefono(v).valor : "");

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Crear cliente</h1>
        <p className="text-muted-foreground">
          Se crea en Odoo con el RIF, teléfonos y correo revisados, y el nombre comercial en «Referencia».
        </p>
      </div>

      {errorGeneral && (
        <div className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {errorGeneral}
        </div>
      )}

      {cargando && !sedes.length ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Identificación</CardTitle>
              <CardDescription>Escribe el RIF como venga: el panel lo deja sin guiones y revisa el dígito verificador.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {!sedeFija && (
                <Campo etiqueta="Sede" className="sm:col-span-2">
                  <Select value={String(sede ?? "")} onValueChange={(v) => { setCoincidencias(null); setForm((f) => ({ ...f, vendedorId: "" })); cargar(Number(v)); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {sedes.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.nombre}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Campo>
              )}

              <Campo etiqueta="Tipo de cliente" className="sm:col-span-2">
                <div className="grid grid-cols-2 gap-2">
                  {([["empresa", "Empresa", Building2, "RIF J, G, P o C"], ["persona", "Persona", UserRound, "Cédula o RIF V / E"]] as const).map(([v, txt, Icono, ayuda]) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => poner("tipo", v)}
                      aria-pressed={form.tipo === v}
                      className={`flex items-center gap-3 rounded-md border p-3 text-left transition-colors ${form.tipo === v ? "border-primary bg-primary/5" : "hover:bg-muted"}`}
                    >
                      <Icono className="h-5 w-5" />
                      <span>
                        <span className="block font-medium">{txt}</span>
                        <span className="block text-xs text-muted-foreground">{ayuda}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </Campo>

              <Campo etiqueta={form.tipo === "empresa" ? "RIF" : "Cédula o RIF"} error={errorDe("rif")} ayuda={rifVista && `Se guarda como ${rifVista}`}>
                <div className="relative">
                  <Input value={form.rif} onChange={(e) => poner("rif", e.target.value)} onBlur={buscarRif} placeholder={form.tipo === "empresa" ? "J-12345678-9" : "V-12345678"} autoComplete="off" />
                  {buscandoRif && <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />}
                </div>
              </Campo>

              <Campo etiqueta={form.tipo === "empresa" ? "Razón social" : "Nombre y apellido"} error={errorDe("nombre")} ayuda={form.tipo === "empresa" ? "Como sale en el RIF (con C.A., S.A.…)" : undefined}>
                <Input value={form.nombre} onChange={(e) => poner("nombre", e.target.value)} onBlur={() => tocar("nombre")} placeholder={form.tipo === "empresa" ? "INVERSIONES EJEMPLO, C.A." : "MARÍA PÉREZ"} />
              </Campo>

              {coincidencias && coincidencias.length > 0 && (
                <div className="sm:col-span-2 space-y-2">
                  {enEstaSede.length > 0 && (
                    <Aviso rojo titulo="Este cliente ya existe en esta sede: no se puede crear otra vez" filas={enEstaSede} />
                  )}
                  {enOtra.length > 0 && (
                    <Aviso titulo="Ya existe en otra sede. Puedes crearlo aquí si va a comprar en esta sede" filas={enOtra} />
                  )}
                </div>
              )}

              <Campo etiqueta="Nombre comercial" className="sm:col-span-2" error={errorDe("comercial")} ayuda="Como lo conocen (va en «Referencia» de la ficha). Se llena solo con la razón social sin C.A.; cámbialo si es otro.">
                <Input value={form.comercial} onChange={(e) => poner("comercial", e.target.value)} onBlur={() => tocar("comercial")} placeholder="EJEMPLO STORE" />
              </Campo>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contacto</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Campo etiqueta="Teléfono" error={errorDe("telefono")} ayuda={telVista(form.telefono) && `Se guarda como ${telVista(form.telefono)}`}>
                <Input type="tel" inputMode="tel" value={form.telefono} onChange={(e) => poner("telefono", e.target.value)} onBlur={() => tocar("telefono")} placeholder="0412-1234567" />
              </Campo>
              <Campo etiqueta="Otro teléfono (opcional)" error={errorDe("telefono2")} ayuda={telVista(form.telefono2) && `Se guarda como ${telVista(form.telefono2)}`}>
                <Input type="tel" inputMode="tel" value={form.telefono2} onChange={(e) => poner("telefono2", e.target.value)} onBlur={() => tocar("telefono2")} placeholder="0241-1234567" />
              </Campo>
              <Campo etiqueta="Correo" className="sm:col-span-2" error={errorDe("email")} ayuda={form.email && revisarEmail(form.email).ok && form.email !== revisarEmail(form.email).valor ? `Se guarda como ${revisarEmail(form.email).valor}` : undefined}>
                <Input type="email" inputMode="email" value={form.email} onChange={(e) => poner("email", e.target.value)} onBlur={() => tocar("email")} placeholder="compras@empresa.com" />
              </Campo>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Dirección y vendedor</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Campo etiqueta="Dirección" className="sm:col-span-2" error={errorDe("direccion")}>
                <Input value={form.direccion} onChange={(e) => poner("direccion", e.target.value)} onBlur={() => tocar("direccion")} placeholder="AV. BOLÍVAR, EDIF. CENTRO, PISO 1, LOCAL 3, SECTOR CENTRO" />
              </Campo>
              <Campo etiqueta="Ciudad" error={errorDe("ciudad")}>
                <Input value={form.ciudad} onChange={(e) => poner("ciudad", e.target.value)} onBlur={() => tocar("ciudad")} placeholder="VALENCIA" />
              </Campo>
              <Campo etiqueta="Estado" error={errorDe("estadoId")}>
                <Select value={form.estadoId} onValueChange={(v) => { poner("estadoId", v); tocar("estadoId"); }}>
                  <SelectTrigger><SelectValue placeholder="Elige el estado" /></SelectTrigger>
                  <SelectContent>
                    {estados.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Campo>
              <Campo etiqueta="Vendedor" className="sm:col-span-2" error={errorDe("vendedorId")}>
                <Select value={form.vendedorId} onValueChange={(v) => { poner("vendedorId", v); tocar("vendedorId"); }} disabled={cargando}>
                  <SelectTrigger><SelectValue placeholder="Elige el vendedor" /></SelectTrigger>
                  <SelectContent>
                    {vendedores.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Campo>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button size="lg" onClick={guardar} disabled={guardando || enEstaSede.length > 0}>
              {guardando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
              Crear cliente en Odoo
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function Campo({ etiqueta, error, ayuda, className, children }: { etiqueta: string; error?: string; ayuda?: string | false; className?: string; children: React.ReactNode }) {
  return (
    <div className={`space-y-1.5 ${className || ""}`}>
      <Label>{etiqueta}</Label>
      {children}
      {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : ayuda ? <p className="text-xs text-muted-foreground">{ayuda}</p> : null}
    </div>
  );
}

function Aviso({ titulo, filas, rojo }: { titulo: string; filas: Coincidencia[]; rojo?: boolean }) {
  return (
    <div className={`rounded-md border p-3 text-sm ${rojo ? "border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100" : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"}`}>
      <p className="mb-2 flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4" /> {titulo}</p>
      <ul className="space-y-1">
        {filas.map((c) => (
          <li key={c.id}>
            <a href={c.url} target="_blank" rel="noreferrer" className="underline">{c.nombre}</a>
            {c.comercial && c.comercial !== c.nombre ? ` (${c.comercial})` : ""} · {c.rif} · {c.sedeNombre}{c.vendedor ? ` · ${c.vendedor}` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}
