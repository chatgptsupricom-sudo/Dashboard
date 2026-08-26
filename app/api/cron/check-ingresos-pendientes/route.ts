import { query } from "@/lib/db";
import { diasUmbral, ingresosPendientes } from "@/lib/seguridad/pendientes";
import { NextResponse } from "next/server";

/**
 * Aviso proactivo al equipo técnico de los equipos que llevan demasiado tiempo
 * en el taller sin despachar (issue #37).
 *
 * El dashboard de Seguridad ya muestra "En taller > 7d", pero hay que abrirlo
 * para verlo. Esto lo empuja: socket para quien tenga el panel abierto y
 * webhook de n8n para quien no.
 *
 * SOBRE A QUIÉN SE LE AVISA — el issue pedía agrupar por técnico asignado, vía
 * `rma_cases.assigned_technician_id`. Ese campo no existe: `rma_cases` no
 * tiene ninguna noción de asignación (ver sql/rma_cases.sql), y no la tiene
 * ninguna otra tabla del repo. Así que se avisa a todos los usuarios con rol
 * `rma`, que es el equipo técnico tal como está modelado hoy. Cuando exista la
 * asignación, lo único que cambia es la función `tecnicosANotificar` de abajo:
 * el resto del flujo ya reparte por sala de usuario, no en broadcast.
 *
 * `?dry=1` calcula todo y devuelve exactamente lo que se mandaría, pero no
 * emite ni llama a n8n. Existe porque la única forma de probar esto contra
 * datos reales era mandarle un WhatsApp de verdad a los técnicos, y una
 * prueba no puede costar eso.
 *
 * En dry run se acepta además `?dias=N`, que pisa el umbral. Sirve para
 * distinguir "no hay equipos vencidos" de "la consulta no ve nada": con un
 * umbral de 1 día tiene que aparecer cualquier ingreso sin despachar. Solo en
 * dry run, a propósito — si `dias` valiera en el modo real, cualquiera con el
 * secreto podria forzar una alerta masiva bajando el umbral a 1.
 */

export async function GET(request: Request) {
  const dryRun = new URL(request.url).searchParams.get("dry") === "1";
  // Sin CRON_SECRET configurado, `Bearer undefined` haría de contraseña.
  // Mejor no arrancar que arrancar abierto.
  if (!process.env.CRON_SECRET) {
    console.error("[cron-pendientes] CRON_SECRET no está configurado");
    return new NextResponse("Cron no configurado", { status: 500 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("No autorizado", { status: 401 });
  }

  try {
    const dias = dryRun ? diasSolicitados(request) ?? diasUmbral() : diasUmbral();
    const pendientes = await ingresosPendientes(dias);

    if (pendientes.length === 0) {
      console.log(`[cron-pendientes] sin ingresos de más de ${dias} días`);
      return NextResponse.json({
        checked: 0,
        alerts_sent: 0,
        dias_umbral: dias,
        ...(dryRun ? { dry_run: true } : {}),
      });
    }

    // Vienen ordenados de más viejo a más nuevo.
    const oldestDays = pendientes[0].dias_en_taller;

    const tecnicos = await tecnicosANotificar();

    const payload = {
      count: pendientes.length,
      oldest_days: oldestDays,
      dias_umbral: dias,
      generado_en: new Date().toISOString(),
      // Al socket va lo justo para pintar el aviso; el detalle completo lo pide
      // la pantalla a /api/rma/ingresos-pendientes cuando el técnico hace clic.
      ingresos: pendientes.slice(0, 50).map((i) => ({
        id: i.id,
        dias_en_taller: i.dias_en_taller,
        cliente_nombre: i.cliente_nombre,
        hardware: i.hardware,
        serial: i.serial,
        case_number: i.case_number,
      })),
    };

    if (dryRun) {
      console.log(
        `[cron-pendientes] DRY RUN: ${pendientes.length} pendientes, ` +
          `se le avisaria a ${tecnicos.length} tecnicos`,
      );
      return NextResponse.json({
        dry_run: true,
        checked: pendientes.length,
        would_alert: tecnicos.length,
        dias_umbral: dias,
        oldest_days: oldestDays,
        socket_disponible: Boolean((global as any).io),
        n8n_configurado: Boolean(process.env.N8N_LEAD_WEBHOOK_URL),
        destinatarios: tecnicos,
        payload,
      });
    }

    let enviados = 0;
    const io = (global as any).io;
    if (io) {
      for (const t of tecnicos) {
        try {
          io.to(`user_${t.id}`).emit("ingresos_pendientes_alerta", payload);
          enviados++;
        } catch (e: any) {
          console.error(`[cron-pendientes] socket a user_${t.id}:`, e?.message);
        }
      }
    } else {
      console.warn("[cron-pendientes] global.io no disponible, no se emite");
    }

    // Fire-and-forget, igual que el ticket del portal: si n8n falla, los datos
    // ya están y el socket ya salió. El aviso no puede tumbar la operación.
    if (process.env.N8N_LEAD_WEBHOOK_URL) {
      fetch(process.env.N8N_LEAD_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          evento: "ingresos_pendientes_alerta",
          origen: "seguridad",
          dias_umbral: dias,
          count: pendientes.length,
          oldest_days: oldestDays,
          destinatarios: tecnicos.map((t) => ({
            id: t.id,
            nombre: t.name,
            email: t.email,
          })),
          ingresos: pendientes.map((i) => ({
            id: i.id,
            fecha_entrega: i.fecha_entrega,
            dias_en_taller: i.dias_en_taller,
            cliente_nombre: i.cliente_nombre,
            hardware: i.hardware,
            serial: i.serial,
            factura_numero: i.factura_numero,
            case_number: i.case_number,
          })),
        }),
      }).catch((err) => {
        console.error("[cron-pendientes] n8n webhook error:", err.message);
      });
    }

    console.log(
      `[cron-pendientes] ${pendientes.length} pendientes de más de ${dias} días, ` +
        `avisados ${enviados}/${tecnicos.length} técnicos`,
    );

    return NextResponse.json({
      checked: pendientes.length,
      alerts_sent: enviados,
      dias_umbral: dias,
      oldest_days: oldestDays,
    });
  } catch (error: any) {
    console.error("[cron-pendientes] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * El equipo técnico. Hoy es "todos los del rol rma"; el día que `rma_cases`
 * tenga técnico asignado, esto pasa a recibir los ingresos y devolver solo los
 * responsables de cada uno.
 */
async function tecnicosANotificar(): Promise<
  { id: number; name: string | null; email: string | null }[]
> {
  const { rows } = await query(
    `SELECT uc.id, uc.name, uc.email
       FROM users_config uc
       JOIN roles r ON uc.role_id = r.id
      WHERE LOWER(TRIM(r.name)) = 'rma'`,
  );
  return rows as any[];
}

/** `?dias=N` del dry run. Devuelve null si no vino o si no es un entero sano. */
function diasSolicitados(request: Request): number | null {
  const crudo = new URL(request.url).searchParams.get("dias");
  if (crudo === null) return null;
  const n = parseInt(crudo, 10);
  // Mismo acotado que el umbral de verdad: se interpola en el SQL.
  if (!Number.isFinite(n) || n < 0 || n > 365) return null;
  return n;
}
