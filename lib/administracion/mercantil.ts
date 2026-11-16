import crypto from "crypto";
import { callOdooRPCEstricto } from "@/lib/odoo";
import {
  BANCOS_VE,
  celular58,
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
 * Pago Movil: "Busqueda de Transacciones Tpago" (`/mobile-payment/search`,
 * tambien activo, con las credenciales "C2P" de la misma cuenta). Pide el
 * celular completo de quien pago (sin el no lo encuentra; probado el
 * 16-nov-2026), la referencia (bastan los ultimos 6), el monto y el dia.
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
  /** Pago Movil (Tpago); null si la cuenta no lo tiene. */
  pm: { clientId: string; clave: string; merchantId: number; telefono: string } | null;
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
          "c2p_client_id",
          "c2p_secret_key",
          "c2p_merchant_id",
          "phone_number",
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
        pm:
          a.c2p_client_id && a.c2p_secret_key && Number(a.c2p_merchant_id) && celular58(String(a.phone_number || ""))
            ? {
                clientId: String(a.c2p_client_id),
                clave: String(a.c2p_secret_key),
                merchantId: Number(a.c2p_merchant_id),
                telefono: celular58(String(a.phone_number || ""))!,
              }
            : null,
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
    tipo: "transferencia",
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

/** Una consulta de Pago Movil: la transaccion, null si no hay (codigo 0330), o un error. */
async function buscarPagoMovil(
  cred: Credenciales,
  q: { referencia: string; monto: number; fecha: string; telefono: string },
): Promise<Encontrada | null> {
  const pm = cred.pm!;
  const cuerpo = {
    merchant_identify: { integratorId: cred.integratorId, merchantId: pm.merchantId, terminalId: cred.terminalId },
    client_identify: {
      ipaddress: "10.0.0.1",
      browser_agent: "panel",
      mobile: { manufacturer: "", model: "", os_version: "", location: { lat: 0, lng: 0 } },
    },
    search_by: {
      amount: Math.round(q.monto * 100) / 100,
      currency: "ves",
      // Da igual el orden: Mercantil la encuentra con los dos celulares en cualquiera de los dos campos.
      origin_mobile_number: cifrar(pm.telefono, pm.clave),
      destination_mobile_number: cifrar(q.telefono, pm.clave),
      payment_reference: q.referencia,
      trx_date: q.fecha,
    },
  };
  let res: Response;
  try {
    res = await fetch(`${cred.url}/mobile-payment/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-IBM-Client-Id": pm.clientId },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e: any) {
    throw new ErrorMercantil(`No se pudo conectar con Mercantil (${e?.name === "TimeoutError" ? "no respondió" : e?.message})`);
  }
  const j: any = await res.json().catch(() => null);
  const errores: any[] = Array.isArray(j?.error_list) ? j.error_list : [];
  if (errores.some((e) => /^0*330$/.test(String(e?.error_code)))) return null;
  const lista: any[] = Array.isArray(j?.transaction_list) ? j.transaction_list : [];
  if (!res.ok || !lista.length) {
    const detalle = errores.map((e) => `${e?.error_code} ${e?.description}`).join("; ") || String(j?.moreInformation || "");
    throw new ErrorMercantil(`Mercantil (Pago Móvil) respondió ${res.status}${detalle ? `: ${detalle}` : ""}`);
  }
  const t = lista[0];
  return {
    tipo: "pago_movil",
    fecha: String(t.trx_date || q.fecha).slice(0, 10),
    hora: "",
    estatus: "A",
    pagador: "",
    pagadorId: descifrar(t.destination_id, pm.clave),
    telefono: q.telefono,
    autorizacion: String(t.authorization_code || ""),
    canal: "PAGO MOVIL",
    yaConsultada: false,
  };
}

const DIA_MS = 86400_000;
const otroDia = (dia: string, n: number) => new Date(Date.parse(dia) + n * DIA_MS).toISOString().slice(0, 10);

/**
 * Busca el comprobante en el banco. Transferencia: con el banco del comprobante
 * prueba su dia, el siguiente y el anterior (de otro banco puede abonarse al otro
 * dia); despues, o si no dice el banco, los demas bancos en su dia (hasta ~28
 * consultas). Pago Movil (o una transferencia que no aparecio): con cada celular
 * candidato de quien pago, su dia, el siguiente y el anterior. Sin celular
 * completo no se puede: queda "sin_telefono" para que lo escriban.
 */
export async function verificarEnMercantil(
  cred: Credenciales,
  c: {
    referencia: string;
    monto: number;
    moneda: string;
    fecha: string;
    banco: string;
    /** true = el comprobante es de Pago Movil; null = no se sabe (comprobantes de antes). */
    pagoMovil: boolean | null;
    /** Celulares posibles de quien pago (58 + 10 digitos). */
    telefonos: string[];
  },
): Promise<VerificacionApi> {
  const el = new Date().toISOString();
  if (!esBolivares(c.moneda)) {
    return { estado: "no_aplica", el, mensaje: `El comprobante está en ${c.moneda}: la cuenta es en bolívares` };
  }
  const digitos = String(c.referencia || "").replace(/\D/g, "");
  if (digitos.length < 4) return { estado: "no_aplica", el, mensaje: "La referencia no tiene suficientes dígitos" };
  const dias = [0, 1, -1].map((n) => otroDia(c.fecha, n));
  const dia = c.fecha.split("-").reverse().join("/");
  try {
    if (c.pagoMovil !== true) {
      const referencia = referenciaMercantil(c.referencia);
      const propio = codigoBanco(c.banco);
      const intentos: { banco: number; fecha: string }[] = [];
      if (propio) for (const f of dias) intentos.push({ banco: propio, fecha: f });
      for (const b of BANCOS_VE) if (b.codigo !== propio) intentos.push({ banco: b.codigo, fecha: c.fecha });
      for (const i of intentos) {
        const t = await buscar(cred, { referencia, monto: c.monto, fecha: i.fecha, banco: i.banco });
        if (t) return { estado: "confirmado", el, ...t };
      }
    }
    if (cred.pm) {
      for (const telefono of c.telefonos.slice(0, 10)) {
        for (const f of dias) {
          const t = await buscarPagoMovil(cred, { referencia: digitos.slice(-6), monto: c.monto, fecha: f, telefono });
          if (t) return { estado: "confirmado", el, ...t };
        }
      }
    }
  } catch (e: any) {
    if (e instanceof ErrorMercantil) return { estado: "error", el, mensaje: e.message };
    throw e;
  }
  if (c.pagoMovil === true) {
    if (!cred.pm) return { estado: "no_aplica", el, mensaje: "Pago Móvil: la cuenta no tiene la API de Pago Móvil" };
    if (!c.telefonos.length) {
      return { estado: "sin_telefono", el, mensaje: "Pago Móvil: falta el celular completo de quien pagó para buscarlo" };
    }
    const cuantos = c.telefonos.length === 1 ? "ese celular" : `${c.telefonos.length} celulares posibles`;
    return { estado: "no_encontrado", el, mensaje: `Mercantil no encontró el Pago Móvil del ${dia} ±1 día con ${cuantos}` };
  }
  return {
    estado: "no_encontrado",
    el,
    mensaje: `Mercantil no la encontró como transferencia el ${dia} ±1 día${cred.pm && c.telefonos.length ? " ni como Pago Móvil" : ""}`,
  };
}

/** Llave de la transferencia que encontro el banco: la misma en dos comprobantes es un pago repetido. */
export const claveTransferencia = (v: VerificacionApi, referencia: string, monto: number) =>
  v.estado !== "confirmado"
    ? null
    : v.tipo === "pago_movil"
      ? ["pm", v.fecha, v.autorizacion, monto.toFixed(2)].join("|")
      : [v.bancoId, v.fecha, v.hora, referenciaMercantil(referencia), monto.toFixed(2)].join("|");
