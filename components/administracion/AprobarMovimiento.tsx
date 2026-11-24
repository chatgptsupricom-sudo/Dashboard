"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Aviso } from "@/components/administracion/comunes";
import type { ConciliacionBanco, CuentaContable } from "@/lib/administracion/bancos";
import { ajustePermitido, type PagoOdoo } from "@/lib/administracion/bancosCruce";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type Movimiento = ConciliacionBanco["movimientos"][number];
type Opcion = "pagos" | "cuenta" | "transferencia" | "sin_conciliar";

const cifra = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dia = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const diasEntre = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400_000;
const textoCuenta = (c: CuentaContable) => `${c.codigo} ${c.nombre}`;

const OPCIONES: { valor: Opcion; titulo: string; detalle: string }[] = [
  { valor: "pagos", titulo: "Cobro(s) o pago(s) de Odoo", detalle: "Uno solo, o varios que sumen justo el movimiento. Incluye transferencias internas y asientos que quedaron en pendientes." },
  { valor: "cuenta", titulo: "Cuenta contable", detalle: "Comisión, IGTF, intereses, gastos…" },
  { valor: "transferencia", titulo: "Transferencia entre cuentas propias", detalle: "Va a la cuenta de transferencias internas; se concilia con la otra cuenta cuando su movimiento esté." },
  { valor: "sin_conciliar", titulo: "Pasar a Odoo sin conciliar", detalle: "Crea la línea en el extracto de Odoo y se termina en la conciliación de Odoo." },
];

/**
 * Aprobar un movimiento del estado de cuenta contra lo que corresponda: crea la
 * linea de extracto en Odoo y la concilia (PATCH {conciliar} de la API).
 */
export function AprobarMovimiento({
  cuenta,
  movimiento: m,
  pagosLibres,
  cerrar,
  listo,
}: {
  cuenta: number;
  movimiento: Movimiento | null;
  pagosLibres: PagoOdoo[];
  cerrar: () => void;
  listo: () => void;
}) {
  const [opcion, setOpcion] = useState<Opcion>("pagos");
  const [elegidos, setElegidos] = useState<number[]>([]);
  const [filtro, setFiltro] = useState("");
  const [contables, setContables] = useState<CuentaContable[] | null>(null);
  const [textoContable, setTextoContable] = useState("");
  const [enviando, setEnviando] = useState(false);
  /** Corregir en Odoo el monto del unico elegido al del banco (difiere hasta 1 %). */
  const [ajustar, setAjustar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // Cobros si es entrada, pagos si es salida; sin los ya conciliados en Odoo. El propuesto primero, despues los mas parecidos.
  const candidatos = useMemo(() => {
    if (!m) return [];
    const propuestos = m.pago ? [m.pago, ...m.otrosPagos] : [];
    const otros = pagosLibres
      .filter((p) => !propuestos.some((x) => x.id === p.id))
      .sort((a, b) => Math.abs(a.monto - m.monto) - Math.abs(b.monto - m.monto) || diasEntre(a.fecha, m.fecha) - diasEntre(b.fecha, m.fecha));
    return [...propuestos, ...otros].filter((p) => p.monto > 0 === m.monto > 0 && !p.conciliado);
  }, [m, pagosLibres]);

  useEffect(() => {
    if (!m) return;
    setError(null);
    setAviso(null);
    setFiltro("");
    setElegidos(m.pago ? [m.pago, ...m.otrosPagos].map((p) => p.id) : []);
    setTextoContable(m.sugerida ? textoCuenta(m.sugerida) : "");
    setOpcion(m.pago ? "pagos" : m.sugerida ? "cuenta" : candidatos.length ? "pagos" : "sin_conciliar");
  }, [m]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!m || opcion !== "cuenta" || contables) return;
    fetch(`/api/administracion/bancos?cuenta=${cuenta}&contables=1`)
      .then((r) => r.json())
      .then((j) => (j.success ? setContables(j.contables) : setError(j.error || "No se pudieron leer las cuentas contables")))
      .catch(() => setError("No se pudieron leer las cuentas contables"));
  }, [m, opcion, contables, cuenta]);

  if (!m) return null;
  const tipo = m.monto > 0 ? "cobro" : "pago";
  const visibles = candidatos
    .filter((p) => !filtro || `${p.nombre} ${p.cliente} ${p.ref} ${p.monto}`.toLowerCase().includes(filtro.toLowerCase()))
    .slice(0, 40);
  const totalElegido = candidatos.filter((p) => elegidos.includes(p.id)).reduce((s, p) => s + p.monto, 0);
  const cuentaElegida = contables?.find((c) => textoCuenta(c) === textoContable) ?? (m.sugerida && textoCuenta(m.sugerida) === textoContable ? m.sugerida : null);
  // Un solo cobro/pago elegido que difiere poco del banco: se ofrece corregir su monto en Odoo.
  const unico = elegidos.length === 1 ? candidatos.find((p) => p.id === elegidos[0]) : undefined;
  const ofrecerAjuste = opcion === "pagos" && !!unico && ajustePermitido(m.monto, unico.monto);
  const listoParaAprobar =
    opcion === "pagos" ? elegidos.length > 0 : opcion === "cuenta" ? !!cuentaElegida : true;

  const aprobar = async () => {
    setEnviando(true);
    setError(null);
    const destino =
      opcion === "pagos"
        ? { pagos: elegidos, ...(ofrecerAjuste && ajustar ? { ajustar_monto: true } : {}) }
        : opcion === "cuenta"
          ? { cuenta_contable: cuentaElegida!.id }
          : opcion === "transferencia"
            ? { transferencia: true }
            : { sin_conciliar: true };
    const res = await fetch("/api/administracion/bancos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cuenta, conciliar: m.id, ...destino }),
    });
    const j = await res.json().catch(() => ({ error: `El servidor respondió ${res.status}` }));
    setEnviando(false);
    if (!j.success) return setError(j.error || "No se pudo conciliar en Odoo");
    listo();
    if (j.aviso) setAviso(`Listo (${j.asiento}). ${j.aviso}`);
    else cerrar();
  };

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && !enviando && cerrar()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Aprobar {m.monto > 0 ? "entrada" : "salida"} del {dia(m.fecha)} · {cifra(m.monto)}
          </DialogTitle>
          <DialogDescription>
            {m.referencia ? `Ref ${m.referencia} · ` : ""}
            {m.descripcion}
          </DialogDescription>
        </DialogHeader>

        {aviso ? (
          <Aviso tono="ambar">{aviso}</Aviso>
        ) : (
          <div className="space-y-4">
            <fieldset className="grid sm:grid-cols-2 gap-2">
              <legend className="sr-only">Contra qué se concilia</legend>
              {OPCIONES.map((o) => (
                <label
                  key={o.valor}
                  className={`border rounded-lg p-3 cursor-pointer text-sm ${opcion === o.valor ? "border-blue-500 bg-blue-50" : "hover:bg-gray-50"}`}
                >
                  <input type="radio" name="destino" className="mr-2" checked={opcion === o.valor} onChange={() => setOpcion(o.valor)} />
                  <span className="font-medium">{o.valor === "pagos" ? (m.monto > 0 ? "Cobro(s) de Odoo" : "Pago(s) de Odoo") : o.titulo}</span>
                  <span className="block text-xs text-gray-500 mt-1">{o.detalle}</span>
                </label>
              ))}
            </fieldset>

            {opcion === "pagos" && (
              <div className="space-y-2">
                <Input placeholder={`Buscar ${tipo} por número, nombre, ref o monto`} value={filtro} onChange={(e) => setFiltro(e.target.value)} />
                {candidatos.length === 0 ? (
                  <p className="text-sm text-gray-500">No hay {tipo}s de Odoo libres en esta cuenta cerca de esa fecha.</p>
                ) : (
                  <div className="border rounded-lg max-h-72 overflow-y-auto divide-y">
                    {visibles.map((p) => (
                      <label key={p.id} className="flex items-start gap-2 p-2 text-sm cursor-pointer hover:bg-gray-50">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={elegidos.includes(p.id)}
                          onChange={(e) => setElegidos((v) => (e.target.checked ? [...v, p.id] : v.filter((x) => x !== p.id)))}
                        />
                        <span className="flex-1">
                          <span className="font-medium">{p.nombre}</span> · {p.cliente}
                          <span className="block text-xs text-gray-500">
                            Memo {p.ref || "—"} · {dia(p.fecha)}
                            {p.id === m.pago?.id || m.otrosPagos.some((x) => x.id === p.id) ? " · propuesto" : ""}
                          </span>
                        </span>
                        <span className="whitespace-nowrap">{cifra(p.monto)}</span>
                      </label>
                    ))}
                  </div>
                )}
                <p className={`text-xs ${elegidos.length > 1 && Math.abs(totalElegido - m.monto) >= 0.01 ? "text-red-700" : "text-gray-500"}`}>
                  Elegido: {cifra(totalElegido)} de {cifra(m.monto)}. Uno solo puede ser mayor (se abonó en partes); varios tienen que sumar justo el movimiento.
                </p>
                {ofrecerAjuste && unico && (
                  <label className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm cursor-pointer">
                    <input type="checkbox" className="mt-1" checked={ajustar} onChange={(e) => setAjustar(e.target.checked)} />
                    <span>
                      Corregir en Odoo el monto de <span className="font-medium">{unico.nombre}</span> de {cifra(Math.abs(unico.monto))} a{" "}
                      <span className="font-medium">{cifra(Math.abs(m.monto))}</span> (el del banco; diferencia {cifra(Math.abs(m.monto) - Math.abs(unico.monto))})
                      <span className="block text-xs text-gray-600 mt-0.5">
                        Se pasa a borrador, se le pone el monto del banco con la misma tasa y se vuelve a confirmar; queda una nota en Odoo.
                        No se puede si ya está aplicado a facturas. En una transferencia entre cuentas propias, la diferencia en Bs pasa a su
                        asiento de diferencial (el USD no cambia).
                      </span>
                    </span>
                  </label>
                )}
              </div>
            )}

            {opcion === "cuenta" && (
              <div className="space-y-1">
                <Input
                  list="cuentas-contables"
                  placeholder={contables ? "Escribe el código o el nombre de la cuenta" : "Cargando cuentas…"}
                  value={textoContable}
                  onChange={(e) => setTextoContable(e.target.value)}
                />
                <datalist id="cuentas-contables">
                  {(contables || []).map((c) => (
                    <option key={c.id} value={textoCuenta(c)} />
                  ))}
                </datalist>
                {m.sugerida && <p className="text-xs text-gray-500">Propuesta por la descripción: {textoCuenta(m.sugerida)}</p>}
                {textoContable && !cuentaElegida && contables && <p className="text-xs text-red-700">Elige una cuenta de la lista.</p>}
              </div>
            )}
          </div>
        )}

        {error && <Aviso tono="rojo">{error}</Aviso>}

        <DialogFooter>
          {aviso ? (
            <Button onClick={cerrar}>Cerrar</Button>
          ) : (
            <>
              <Button variant="outline" onClick={cerrar} disabled={enviando}>
                Cancelar
              </Button>
              <Button onClick={aprobar} disabled={!listoParaAprobar || enviando}>
                {enviando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                Aprobar en Odoo
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
