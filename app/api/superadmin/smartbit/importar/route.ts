import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { asignarMarcasSmartbit, CORTE_ODOO, importarVentasSmartbit, sedesSmartbit } from "@/lib/smartbit";

export const dynamic = "force-dynamic";

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

// La API de Smartbit deja ~20 llamadas por minuto: varios años de historia
// tardan del orden de una hora, más que cualquier timeout del proxy. Por eso
// el POST arranca la carga en el proceso de server.js (que vive siempre) y
// responde de inmediato; el avance se consulta con GET.
// ponytail: estado en memoria del proceso, se pierde si se reinicia el
// servidor a mitad de carga (basta con volver a correrla: es idempotente).
let estado: {
  corriendo: boolean;
  desde?: string;
  hasta?: string;
  inicio?: string;
  fin?: string;
  sedes: Record<number, { mesesListos: number; renglones: number; ultimoMes?: string; error?: string }>;
} = { corriendo: false, sedes: {} };

/**
 * POST { desde: "YYYY-MM-DD", hasta?: "YYYY-MM-DD", company_id?: 9|10|7 }
 * Trae de Smartbit las ventas previas al corte y las guarda en
 * ventas_smartbit (reemplazando mes por mes). Sin company_id, todas las sedes
 * de SMARTBIT_SEDES.
 */
export async function POST(request: NextRequest) {
  const auth = await requireRoles(request, ["superadmin"]);
  if (auth.error) return auth.error;
  if (estado.corriendo) {
    return NextResponse.json({ error: "Ya hay una importación corriendo", estado }, { status: 409 });
  }

  const body = await request.json().catch(() => ({}));
  const desde = String(body.desde || "");
  const hasta = String(body.hasta || CORTE_ODOO);
  if (!FECHA.test(desde) || !FECHA.test(hasta) || desde > hasta) {
    return NextResponse.json({ error: "desde/hasta deben ser YYYY-MM-DD y desde <= hasta" }, { status: 400 });
  }

  const sedes = sedesSmartbit()
    .map((s) => s.companyId)
    .filter((cid) => !body.company_id || cid === Number(body.company_id));
  if (sedes.length === 0) {
    return NextResponse.json({ error: "Ninguna sede configurada en SMARTBIT_SEDES" }, { status: 400 });
  }

  estado = {
    corriendo: true,
    desde,
    hasta,
    inicio: new Date().toISOString(),
    sedes: Object.fromEntries(sedes.map((cid) => [cid, { mesesListos: 0, renglones: 0 }])),
  };

  void (async () => {
    for (const cid of sedes) {
      const s = estado.sedes[cid];
      try {
        await importarVentasSmartbit(cid, desde, hasta, (mes, renglones) => {
          s.mesesListos++;
          s.renglones += renglones;
          s.ultimoMes = mes;
        });
      } catch (e: any) {
        console.error(`[smartbit] importacion sede ${cid}:`, e);
        s.error = e?.message || "error";
      }
    }
    // Los renglones nuevos llegan sin marca: se cruzan con Odoo al terminar.
    await asignarMarcasSmartbit().catch((e) => console.error("[smartbit] marcas tras importar:", e?.message));
    estado.corriendo = false;
    estado.fin = new Date().toISOString();
  })();

  return NextResponse.json({ iniciado: true, corte: CORTE_ODOO, estado }, { status: 202 });
}

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["superadmin"]);
  if (auth.error) return auth.error;
  return NextResponse.json({ corte: CORTE_ODOO, estado });
}
