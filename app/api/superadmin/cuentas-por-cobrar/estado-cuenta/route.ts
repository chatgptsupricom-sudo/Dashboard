import ExcelJS from "exceljs";
import { callOdooRPC } from "@/lib/odoo";
import { requireRoles } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const COMPANY_MAP: Record<string, number> = { valencia: 9, caracas: 10, panama: 7 };
const COMPANY_IDS_ALL = [7, 9, 10];

async function fetchPaginated(
  model: string,
  domain: any[],
  fields: string[],
): Promise<any[]> {
  let result: any[] = [];
  let offset = 0;
  while (true) {
    const page = await callOdooRPC<any[]>(
      model, "search_read", [domain],
      { fields, order: "id asc", limit: 5000, offset },
    );
    if (!page || page.length === 0) break;
    result = result.concat(page);
    if (page.length < 5000) break;
    offset += 5000;
  }
  return result;
}

/**
 * `digiflex.cxc.report` mapea `move_type = 'entry'` a "Asiento", que no le
 * dice nada a quien cobra: bajo ese `entry` caen los recibos de caja, las
 * notas de abono y los ajustes por igual. Aqui se desambigua por el diario,
 * que es de donde sale la diferencia real, para que el estado de cuenta use
 * el mismo vocabulario que el cliente tiene en su factura.
 */
function tipoTransaccion(
  moveType: string,
  journalType: string,
  journalName: string,
): string {
  if (moveType === "out_invoice") return "Factura";
  if (moveType === "out_refund") return "Nota de Crédito";
  if (moveType === "out_receipt") return "Recibo";
  if (journalType === "bank" || journalType === "cash") return "Recibo de Caja";
  return journalName || "Asiento";
}

function ddmmyyyy(fecha: string | null): string {
  if (!fecha) return "";
  const [y, m, d] = String(fecha).split(" ")[0].split("-");
  return `${d}/${m}/${y}`;
}

function diasEntre(desde: string, hasta: string): number {
  const a = Date.parse(`${desde}T00:00:00Z`);
  const b = Date.parse(`${hasta}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86400000);
}

const redondear = (n: number) => Math.round((n || 0) * 100) / 100;

/**
 * `blocked` es el "Excluir seguimiento" del reporte de seguimiento de Odoo:
 * la factura sigue viva contablemente pero cobranza la saco de la gestion
 * (acuerdo, reclamo, litigio). No tiene que aparecer ni en el saldo del
 * listado ni en el movimiento, o se vuelve a cobrar lo que alguien decidio
 * dejar en pausa.
 *
 * Solo se excluye lo que sigue ABIERTO. La marca tambien esta puesta sobre
 * lineas de cobro ya conciliadas, y sacar una de esas rompe su par: el pago
 * desaparece del mayor pero la factura que pago se queda con el residual ya
 * rebajado, y el saldo corrido sube por esa diferencia. Una linea saldada
 * ademas no tiene seguimiento que excluir. Caso real que lo destapo
 * (DISTRIBUIDORA GEEK OR): el cobro PBANES/2026/00732 esta marcado y pago
 * una factura que no lo esta — corria 141,75 el saldo.
 */
const dominioBloqueadas = (companyIds: number[]) => [
  ["blocked", "=", true],
  ["amount_residual", "!=", 0],
  ["account_id.account_type", "=", "asset_receivable"],
  ["parent_state", "=", "posted"],
  ["company_id", "in", companyIds],
];

/**
 * Estado de cuenta por cliente para el rol Cuentas por Cobrar.
 *
 * Sin `partner_id` devuelve la lista de clientes con saldo abierto; con
 * `partner_id` devuelve el movimiento completo (cargos, abonos y saldo
 * corrido). Con `formato=xlsx` devuelve ese mismo movimiento como Excel.
 *
 * El listado sale de `digiflex.cxc.report`, la misma fuente que el resto del
 * modulo, para que el saldo del cliente coincida con lo que muestran el
 * dashboard y el detalle de cartera. El movimiento NO puede salir de ahi:
 * ese reporte filtra `amount_residual <> 0`, o sea solo lo que sigue
 * abierto, y un estado de cuenta sin las facturas ya pagadas ni los recibos
 * que las pagaron no cuadra el saldo contra nada. Por eso va contra
 * `account.move.line` de cuentas por cobrar, que es el mayor auxiliar
 * completo del cliente.
 */
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["cuentas por cobrar"]);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const rol = String(auth.payload?.role || "").toLowerCase().trim();
    const cids = Number(auth.payload?.cids);
    const empresa = (searchParams.get("empresa") || "").toLowerCase();

    // El alcance sale del token, no del query string: sin el filtro de abajo
    // un usuario de una sede leeria la cartera de otra pasando `?empresa=`.
    const alcance =
      rol === "superadmin" || !Number.isFinite(cids) || cids <= 0
        ? COMPANY_IDS_ALL
        : [cids];
    const pedidas = COMPANY_MAP[empresa] ? [COMPANY_MAP[empresa]] : alcance;
    const companyIds = pedidas.filter((id) => alcance.includes(id));
    if (companyIds.length === 0) {
      return NextResponse.json({ error: "Sede fuera de alcance" }, { status: 403 });
    }

    const partnerIdParam = searchParams.get("partner_id");

    // ── Listado de clientes con saldo ──
    if (!partnerIdParam) {
      const registros = await fetchPaginated(
        "digiflex.cxc.report",
        [["company_id", "in", companyIds], ["amount_residual", "!=", 0]],
        [
          "partner_id", "partner_name", "user_name",
          "company_name", "amount_residual", "days_overdue",
        ],
      );

      // `digiflex.cxc.report` no expone `blocked`, asi que las excluidas del
      // seguimiento se piden aparte y se descuentan aqui. El id de la vista
      // es el de la linea contable, por eso se cruzan directo.
      const bloqueadas = new Set(
        (await fetchPaginated("account.move.line", dominioBloqueadas(companyIds), ["id"]))
          .map((l: any) => l.id),
      );

      const porCliente: Record<number, any> = {};
      registros.forEach((r: any) => {
        const pid = r.partner_id?.[0];
        if (!pid) return;
        if (bloqueadas.has(r.id)) return;
        if (!porCliente[pid]) {
          porCliente[pid] = {
            partnerId: pid,
            nombre: r.partner_name || r.partner_id?.[1] || "Sin cliente",
            vendedor: r.user_name || "Sin asignar",
            sede: r.company_name || "",
            saldo: 0,
            vencido: 0,
            documentos: 0,
            diasMax: 0,
          };
        }
        const c = porCliente[pid];
        // Con signo: una nota de credito abierta trae residual negativo y
        // tiene que restar del saldo del cliente, no inflarlo.
        const residual = r.amount_residual || 0;
        c.saldo += residual;
        if ((r.days_overdue || 0) > 0) {
          c.vencido += residual;
          c.diasMax = Math.max(c.diasMax, r.days_overdue);
        }
        c.documentos++;
      });

      const clientes = Object.values(porCliente)
        .map((c: any) => ({
          ...c,
          saldo: redondear(c.saldo),
          vencido: redondear(c.vencido),
        }))
        .sort((a: any, b: any) => b.saldo - a.saldo);

      return NextResponse.json({ success: true, clientes });
    }

    // ── Movimiento de un cliente ──
    const partnerId = parseInt(partnerIdParam, 10);
    if (!Number.isFinite(partnerId) || partnerId <= 0) {
      return NextResponse.json({ error: "partner_id invalido" }, { status: 400 });
    }

    const [partner] = (await callOdooRPC<any[]>(
      "res.partner", "search_read",
      [[["id", "=", partnerId]]],
      { fields: ["name", "vat"], limit: 1 },
    )) || [];
    if (!partner) {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    }

    const lineas = await fetchPaginated(
      "account.move.line",
      [
        ["partner_id", "=", partnerId],
        ["account_id.account_type", "=", "asset_receivable"],
        ["parent_state", "=", "posted"],
        ["company_id", "in", companyIds],
        // Misma regla que `dominioBloqueadas`: pasa si no esta marcada, o si
        // esta marcada pero ya saldada.
        "|", ["blocked", "=", false], ["amount_residual", "=", 0],
      ],
      [
        "move_id", "move_name", "move_type", "journal_id",
        "date", "date_maturity", "debit", "credit", "amount_residual",
        "amount_currency", "currency_id",
      ],
    );

    // El vendedor y el numero de control fiscal viven en `account.move`, no
    // en la linea: se leen en un solo lote por ids, no una llamada por fila.
    // El numero de control es el que el cliente tiene impreso en su factura
    // — en las facturas migradas `name` es el correlativo interno
    // (FCLIE/2026/00070) y con ese numero nadie puede reclamar un cobro.
    const moveIds = [...new Set(lineas.map((l: any) => l.move_id?.[0]).filter(Boolean))];
    const asientos = moveIds.length
      ? (await callOdooRPC<any[]>(
          "account.move", "search_read",
          [[["id", "in", moveIds]]],
          { fields: ["nro_ctrl", "invoice_user_id"], limit: moveIds.length },
        )) || []
      : [];
    const porAsiento: Record<number, any> = {};
    asientos.forEach((m: any) => { porAsiento[m.id] = m; });

    const journalIds = [...new Set(lineas.map((l: any) => l.journal_id?.[0]).filter(Boolean))];
    const diarios = journalIds.length
      ? (await callOdooRPC<any[]>(
          "account.journal", "search_read",
          [[["id", "in", journalIds]]],
          { fields: ["name", "type"], limit: journalIds.length },
        )) || []
      : [];
    const porDiario: Record<number, any> = {};
    diarios.forEach((j: any) => { porDiario[j.id] = j; });

    const hoy = new Date().toISOString().slice(0, 10);

    const ordenadas = [...lineas].sort((a: any, b: any) => {
      const fa = a.date || "";
      const fb = b.date || "";
      if (fa !== fb) return fa < fb ? -1 : 1;
      return a.id - b.id;
    });

    let saldo = 0;
    const movimientos = ordenadas.map((l: any) => {
      const cargo = redondear(l.debit);
      const abono = redondear(l.credit);
      // Se redondea en cada paso, no al final: con cientos de lineas el
      // arrastre binario corre el saldo unos centimos y el cliente lo nota.
      saldo = redondear(saldo + cargo - abono);

      const diario = porDiario[l.journal_id?.[0]] || {};
      const asiento = porAsiento[l.move_id?.[0]] || {};
      const vencimiento = l.date_maturity || l.date || null;
      // Solo lo que sigue abierto puede estar atrasado: una factura saldada
      // queda en 0 aunque se haya pagado tarde, igual que en el reporte que
      // ya usa el modulo.
      const dias =
        l.amount_residual && vencimiento
          ? Math.max(0, diasEntre(vencimiento, hoy))
          : 0;

      return {
        transaccion: tipoTransaccion(l.move_type, diario.type, diario.name),
        documento: asiento.nro_ctrl || l.move_name || "",
        fecha: l.date || null,
        // El importe tal como se registro en la moneda del documento: en un
        // cobro en bolivares `abono` trae los dolares y esto los Bs.F que el
        // cliente transfirio, que es el numero con el que el reclama. Va en
        // absoluto porque Odoo guarda los creditos en negativo y en el
        // estado de cuenta el signo ya lo da la columna (cargo o abono).
        divisa: redondear(Math.abs(l.amount_currency || 0)),
        moneda: l.currency_id?.[1] || "",
        cargo,
        abono,
        saldo,
        diasAtraso: dias,
        vendedor:
          l.move_type === "out_invoice"
            ? asiento.invoice_user_id?.[1] || ""
            : "",
      };
    });

    const totalCargo = redondear(
      movimientos.reduce((s: number, m: any) => s + m.cargo, 0),
    );
    const totalAbono = redondear(
      movimientos.reduce((s: number, m: any) => s + m.abono, 0),
    );

    if (searchParams.get("formato") === "xlsx") {
      return excel(partnerId, partner, movimientos, totalCargo, totalAbono);
    }

    return NextResponse.json({
      success: true,
      cliente: { id: partnerId, nombre: partner.name || "", vat: partner.vat || "" },
      movimientos,
      totales: { cargo: totalCargo, abono: totalAbono, saldo },
    });
  } catch (error: any) {
    console.error("Error en estado de cuenta CxC:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

const COLUMNAS = [
  { header: "Transaccion", key: "transaccion", width: 18 },
  { header: "Documento", key: "documento", width: 20 },
  { header: "Fecha", key: "fecha", width: 12 },
  { header: "Importe en Divisa", key: "divisa", width: 18 },
  { header: "Moneda", key: "moneda", width: 10 },
  { header: "Cargo", key: "cargo", width: 14 },
  { header: "Abono", key: "abono", width: 14 },
  { header: "Saldo", key: "saldo", width: 14 },
  { header: "Dias Atraso", key: "diasAtraso", width: 12 },
  { header: "Vendedor", key: "vendedor", width: 28 },
];

/**
 * El Excel se arma en el servidor y de la misma consulta que alimenta la
 * pantalla, para que lo descargado sea exactamente lo que la persona esta
 * viendo. Columnas, orden y fila de totales son los del estado de cuenta
 * que ya se le entregaba al cliente, para no obligar a nadie a reaprender
 * el formato.
 */
async function excel(
  partnerId: number,
  partner: any,
  movimientos: any[],
  totalCargo: number,
  totalAbono: number,
) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Supricom";
  wb.created = new Date();

  // Nombre de hoja del formato de siempre: "EC" + RIF. Excel rechaza
  // : \ / ? * [ ] y corta a 31 caracteres, y el RIF de un cliente migrado
  // puede traer cualquiera de esos.
  const hoja = `EC${partner.vat || partnerId}`
    .replace(/[:\\/?*[\]]/g, "")
    .slice(0, 31);
  const ws = wb.addWorksheet(hoja);
  ws.columns = COLUMNAS;

  movimientos.forEach((m: any) => {
    ws.addRow({ ...m, fecha: ddmmyyyy(m.fecha) });
  });

  const totales = ws.addRow({ cargo: totalCargo, abono: totalAbono });
  totales.font = { bold: true };

  const cabecera = ws.getRow(1);
  cabecera.font = { bold: true, color: { argb: "FFFFFFFF" } };
  cabecera.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF741DFE" }, // el morado de Supricom
  };
  cabecera.height = 22;
  ws.views = [{ state: "frozen", ySplit: 1 }];
  // Importe en divisa, cargo, abono y saldo. Van por letra, asi que si se
  // mueve una columna en COLUMNAS hay que mover esto con ella.
  ["D", "F", "G", "H"].forEach((col) => {
    ws.getColumn(col).numFmt = "#,##0.00";
  });

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as any, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${hoja}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
