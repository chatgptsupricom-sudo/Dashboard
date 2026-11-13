import crypto from "crypto";
import { callOdooRPCEstricto } from "@/lib/odoo";
import {
  BANCOS_VE,
  codigoBanco,
  esBolivares,
  referenciaMercantil,
  type VerificacionApi,
} from "@/lib/administracion/bancosCruce";

/**
 * API "Busqueda de Transferencias" de Mercantil (unico producto contratado,
 * aprobado el 7-ago-2026): dice si una transferencia concreta entro a la cuenta,
 * dados los ultimos 8 digitos de la referencia, el monto exacto, el dia y el
 * banco desde donde se pago. No lista los movimientos de la cuenta.
 * Campos en https://www.mercantilbanco.com/mercprod/apiportal/pdfs/api_transfer_search_descripcion_de_atributos_y_campos_0.pdf
 *
 * Las credenciales son las que ya estan cargadas en Odoo, en la cuenta de
 * integracion del modulo de Digiflex (`bank.integration.account`) del diario:
 * una cuenta de Mercantil del panel = un diario con esa integracion activa.
 */

type Credenciales = {
  url: string;
  clientId: string;
  clave: string;
  integratorId: number;
  merchantId: number;
  terminalId: string;
  cuenta: string;
};

const cache = new Map<number, { hasta: number; cred: Credenciales | null }>();

/** Credenciales de la API de Mercantil del diario, o null si ese diario no la tiene. */
export async function credencialesMercantil(journalId: number, sede: number): Promise<Credenciales | null> {
  const guardado = cache.get(journalId);
  if (guardado && guardado.hasta > Date.now()) return guardado.cred;
  let cred: Credenciales | null = null;
  try {
    const filas = await callOdooRPCEstricto<any[]>(
      "bank.integration.account",
      "search_read",
      [[["journal_id", "=", journalId], ["bank_type", "=", "mercantil"], ["active", "=", true]]],
      {
        fields: [
          "environment",
          "base_url_prod",
          "base_url_sandbox",
          "transfer_client_id",
          "transfer_secret_key",
          "transfer_merchant_id",
          "integrator_id",
          "terminal_id",
          "account_number",
        ],
        limit: 1,
        context: { allowed_company_ids: [sede] },
      },
    );
    const a = filas?.[0];
    const url = String((a?.environment === "sandbox" ? a?.base_url_sandbox : a?.base_url_prod) || "").replace(/\/$/, "");
    const cuenta = String(a?.account_number || "").replace(/\D/g, "");
    if (a && url && a.transfer_client_id && a.transfer_secret_key && Number(a.transfer_merchant_id) && cuenta.length === 20) {
      cred = {
        url,
        clientId: String(a.transfer_client_id),
        clave: String(a.transfer_secret_key),
        integratorId: Number(a.integrator_id) || 1,
        merchantId: Number(a.transfer_merchant_id),
        terminalId: String(a.terminal_id || "1"),
        cuenta,
      };
    }
  } catch (e: any) {
    // Sin el modulo de Digiflex el modelo no existe: la cuenta queda sin API.
    console.warn("[mercantil] sin credenciales:", e?.message);
  }
  cache.set(journalId, { hasta: Date.now() + 10 * 60_000, cred });
  return cred;
}

/** AES-128-ECB con los primeros 16 bytes del SHA-256 de la clave, en base64 (como pide Mercantil). */
function llave(clave: string) {
  return crypto.createHash("sha256").update(clave, "utf8").digest().subarray(0, 16);
}
const cifrar = (texto: string, clave: string) => {
  const c = crypto.createCipheriv("aes-128-ecb", llave(clave), null);
  return Buffer.concat([c.update(texto, "utf8"), c.final()]).toString("base64");
};
const descifrar = (texto: string, clave: string) => {
  try {
    const d = crypto.createDecipheriv("aes-128-ecb", llave(clave), null);
    return Buffer.concat([d.update(String(texto), "base64"), d.final()]).toString("utf8").trim();
  } catch {
    return "";
  }
};

class ErrorMercantil extends Error {}

type Encontrada = Omit<VerificacionApi, "estado" | "el" | "mensaje">;

/** Una consulta: la transferencia, null si el banco dice que no hay (codigo 330), o un error. */
async function buscar(
  cred: Credenciales,
  q: { referencia: string; monto: number; fecha: string; banco: number },
): Promise<Encontrada | null> {
  const cuerpo = {
    merchantIdentify: { integratorId: cred.integratorId, merchantId: cred.merchantId, terminalId: cred.terminalId },
    clientIdentify: { ipAddress: "10.0.0.1", browserAgent: "panel", mobile: { manufacturer: "" } },
    transferSearchBy: {
      account: cifrar(cred.cuenta, cred.clave),
      // Mercantil no compara la cedula/RIF de quien paga (probado el 13-nov-2026:
      // con cualquier valor la encuentra) y el comprobante casi nunca la trae.
      issuerCustomerId: cifrar("V1", cred.clave),
      trxDate: q.fecha,
      issuerBankId: q.banco,
      transactionType: 1,
      paymentReference: q.referencia,
      amount: Math.round(q.monto * 100) / 100,
    },
  };
  let res: Response;
  try {
    res = await fetch(`${cred.url}/payment/transfer-search`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-IBM-Client-Id": cred.clientId },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e: any) {
    throw new ErrorMercantil(`No se pudo conectar con Mercantil (${e?.name === "TimeoutError" ? "no respondió" : e?.message})`);
  }
  const j: any = await res.json().catch(() => null);
  const errores: any[] = Array.isArray(j?.errorList) ? j.errorList : [];
  if (errores.some((e) => String(e?.errorCode) === "330")) return null;
  const lista: any[] = Array.isArray(j?.transferSearchList) ? j.transferSearchList : [];
  if (!res.ok || !lista.length) {
    const detalle = errores.map((e) => `${e?.errorCode} ${e?.description}`).join("; ") || (j?.code ? `código ${j.code}` : "");
    throw new ErrorMercantil(`Mercantil respondió ${res.status}${detalle ? `: ${detalle}` : ""}`);
  }
  const t = lista.find((x) => x?.trxStatus === "A") || lista[0];
  return {
    fecha: String(t.trxValueDate || q.fecha).slice(0, 10),
    hora: String(t.trxTime || ""),
    estatus: String(t.trxStatus || ""),
    pagador: descifrar(t.issuerCustomerName, cred.clave),
    pagadorId: descifrar(t.issuerCustomerId, cred.clave),
    bancoId: q.banco,
    canal: String(t.channel || ""),
    yaConsultada: t.previouslySearched === "S",
  };
}

const DIA_MS = 86400_000;
const otroDia = (dia: string, n: number) => new Date(Date.parse(dia) + n * DIA_MS).toISOString().slice(0, 10);

/**
 * Busca el comprobante en el banco. Con el banco del comprobante prueba su dia,
 * el siguiente y el anterior (una transferencia de otro banco puede abonarse al
 * otro dia); despues, o si el comprobante no dice el banco, los demas bancos en
 * su dia. Hasta ~28 consultas, una tras otra.
 */
export async function verificarEnMercantil(
  cred: Credenciales,
  c: { referencia: string; monto: number; moneda: string; fecha: string; banco: string },
): Promise<VerificacionApi> {
  const el = new Date().toISOString();
  const referencia = referenciaMercantil(c.referencia);
  if (!esBolivares(c.moneda)) {
    return { estado: "no_aplica", el, mensaje: `El comprobante está en ${c.moneda}: la cuenta es en bolívares` };
  }
  if (referencia.length < 4) return { estado: "no_aplica", el, mensaje: "La referencia no tiene suficientes dígitos" };
  const propio = codigoBanco(c.banco);
  const intentos: { banco: number; fecha: string }[] = [];
  if (propio) for (const n of [0, 1, -1]) intentos.push({ banco: propio, fecha: otroDia(c.fecha, n) });
  for (const b of BANCOS_VE) if (b.codigo !== propio) intentos.push({ banco: b.codigo, fecha: c.fecha });
  for (const i of intentos) {
    try {
      const t = await buscar(cred, { referencia, monto: c.monto, fecha: i.fecha, banco: i.banco });
      if (t) return { estado: "confirmado", el, ...t };
    } catch (e: any) {
      if (e instanceof ErrorMercantil) return { estado: "error", el, mensaje: e.message };
      throw e;
    }
  }
  return {
    estado: "no_encontrado",
    el,
    mensaje: propio
      ? `Mercantil no la encontró (${BANCOS_VE.find((b) => b.codigo === propio)?.nombre} del ${c.fecha} ±1 día, ni otros bancos ese día)`
      : `Mercantil no la encontró en ningún banco el ${c.fecha} (el comprobante no dice el banco)`,
  };
}

/** Llave de la transferencia que encontro el banco: la misma en dos comprobantes es un pago repetido. */
export const claveTransferencia = (v: VerificacionApi, referencia: string, monto: number) =>
  v.estado === "confirmado" ? [v.bancoId, v.fecha, v.hora, referenciaMercantil(referencia), monto.toFixed(2)].join("|") : null;
