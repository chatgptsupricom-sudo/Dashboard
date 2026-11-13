"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Aviso } from "@/components/administracion/comunes";
import type { ClienteOdoo } from "@/lib/administracion/bancos";
import type { VerificacionApi } from "@/lib/administracion/bancosCruce";
import { CheckCircle2, Loader2, Search } from "lucide-react";
import { useEffect, useState } from "react";

type Vista = {
  comprobante: { id: number; referencia: string; monto: number; fecha: string; cliente: string; api: VerificacionApi };
  diario: string;
  moneda: string;
  metodo: string;
  tasaBcv: number;
  sugeridos: ClienteOdoo[];
  descripcion: string;
};

const cifra = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dia = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

async function llamar(cuerpo: Record<string, unknown>) {
  const res = await fetch("/api/administracion/bancos", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  return res.json().catch(() => ({ error: `El servidor respondió ${res.status}` }));
}

/**
 * Vista previa del cobro que se va a crear en Odoo con un comprobante que el
 * banco confirmo, y el boton para aprobarlo. Los campos son los que llena
 * Cuentas por Cobrar a mano; el cliente, la tasa y la descripcion se revisan aqui.
 */
export function RegistrarCobroOdoo({
  cuenta,
  comprobante,
  cerrar,
  listo,
}: {
  cuenta: number;
  comprobante: number | null;
  cerrar: () => void;
  listo: () => void;
}) {
  const [vista, setVista] = useState<Vista | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cliente, setCliente] = useState<ClienteOdoo | null>(null);
  const [opciones, setOpciones] = useState<ClienteOdoo[]>([]);
  const [buscar, setBuscar] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [tasa, setTasa] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [hecho, setHecho] = useState<{ nombre: string; confirmado: boolean; aviso?: string } | null>(null);

  useEffect(() => {
    setVista(null);
    setError(null);
    setHecho(null);
    setCliente(null);
    setBuscar("");
    if (!comprobante) return;
    llamar({ cuenta, comprobante }).then((j) => {
      if (!j.success) return setError(j.error || "No se pudo preparar el cobro");
      setVista(j);
      setOpciones(j.sugeridos);
      setCliente(j.sugeridos[0] ?? null);
      setTasa(j.tasaBcv ? String(j.tasaBcv) : "");
      setDescripcion(j.descripcion || "");
    });
  }, [cuenta, comprobante]);

  const buscarClientes = async () => {
    setBuscando(true);
    const j = await llamar({ cuenta, comprobante, buscar });
    setBuscando(false);
    if (!j.success) return setError(j.error || "No se pudo buscar");
    setOpciones(j.clientes);
    if (j.clientes.length) setCliente(j.clientes[0]);
  };

  const aprobar = async () => {
    if (!cliente) return;
    setEnviando(true);
    setError(null);
    const j = await llamar({ cuenta, comprobante, aprobar: true, partner_id: cliente.id, tasa: Number(tasa), descripcion });
    setEnviando(false);
    if (!j.success) return setError(j.error || "No se pudo registrar");
    setHecho(j);
    listo();
  };

  const c = vista?.comprobante;
  const tasaNum = Number(tasa);
  const filas: [string, React.ReactNode][] = c
    ? [
        ["Diario", vista.diario],
        ["Método de pago", vista.metodo],
        ["Fecha", dia(c.fecha)],
        ["Referencia", <span className="font-mono">{c.referencia}</span>],
        ["Monto", `${cifra(c.monto)} ${vista.moneda}`],
        ["Equivalente", tasaNum > 0 ? `${cifra(c.monto / tasaNum)} USD` : "—"],
        ["Vendedor", cliente?.vendedor || "—"],
        [
          "Según el banco",
          `${c.api.pagador || "—"} (${c.api.pagadorId || "—"}) · ${c.api.hora || ""} · ${c.api.estatus === "A" ? "aprobada" : c.api.estatus || ""}`,
        ],
      ]
    : [];

  return (
    <Dialog open={comprobante !== null} onOpenChange={(abierto) => !abierto && cerrar()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar el cobro en Odoo</DialogTitle>
          <DialogDescription>
            Revisa los datos: al aprobar se crea y se confirma el cobro en Odoo, con una nota de que lo registraste desde el panel.
          </DialogDescription>
        </DialogHeader>
        {error && <Aviso tono="rojo">{error}</Aviso>}
        {hecho ? (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-emerald-700 font-medium">
              <CheckCircle2 className="h-5 w-5" />
              {hecho.confirmado ? `Cobro ${hecho.nombre} registrado y confirmado en Odoo.` : `Cobro ${hecho.nombre} creado en Odoo.`}
            </p>
            {hecho.aviso && <Aviso tono="ambar">{hecho.aviso}</Aviso>}
            <DialogFooter>
              <Button onClick={cerrar}>Cerrar</Button>
            </DialogFooter>
          </div>
        ) : !vista ? (
          !error && (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            </div>
          )
        ) : (
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="registrar-cliente">
                Cliente
              </label>
              <select
                id="registrar-cliente"
                value={cliente?.id ?? ""}
                onChange={(e) => setCliente(opciones.find((o) => o.id === Number(e.target.value)) ?? null)}
                className="w-full border rounded-md px-2 py-2 text-sm bg-white"
              >
                {!opciones.length && <option value="">No encontré el cliente: búscalo abajo</option>}
                {opciones.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nombre} {o.rif ? `· ${o.rif}` : ""}
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <Input
                  value={buscar}
                  onChange={(e) => setBuscar(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && buscar.trim().length >= 3 && buscarClientes()}
                  placeholder="Buscar otro cliente por nombre o RIF"
                  aria-label="Buscar cliente en Odoo"
                />
                <Button variant="outline" disabled={buscar.trim().length < 3 || buscando} onClick={buscarClientes}>
                  {buscando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-gray-500">Archivo del comprobante: {c!.cliente || "sin nombre"}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="registrar-tasa">
                  Tasa (Bs por dólar)
                </label>
                <Input id="registrar-tasa" type="number" step="0.01" min="0" value={tasa} onChange={(e) => setTasa(e.target.value)} />
                <p className="text-xs text-gray-500">BCV del día: {vista.tasaBcv ? cifra(vista.tasaBcv) : "—"}. Usa la tasa acordada con el cliente.</p>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="registrar-descripcion">
                  Descripción
                </label>
                <textarea
                  id="registrar-descripcion"
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  rows={3}
                  placeholder="Facturas que paga, ej. 5038962-5038963"
                  className="w-full border rounded-md px-3 py-2 text-sm"
                />
              </div>
            </div>

            <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-sm border rounded-lg p-3 bg-gray-50">
              {filas.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-gray-500">{k}</dt>
                  <dd className="min-w-0 break-words">{v}</dd>
                </div>
              ))}
            </dl>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={cerrar} disabled={enviando}>
                Cancelar
              </Button>
              <Button onClick={aprobar} disabled={!cliente || !(tasaNum > 0) || !descripcion.trim() || enviando}>
                {enviando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Aprobar y registrar en Odoo
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
