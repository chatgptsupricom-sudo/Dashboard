// // import { query } from "@/lib/db";
// // import { NextResponse } from "next/server";
// // import { jwtVerify } from "jose";

// // export async function PATCH(request: Request) {
// //   try {
// //     // 1. Extraer y verificar token de autenticación
// //     const cookieHeader = request.headers.get("cookie");
// //     const token = cookieHeader
// //       ?.split(";")
// //       .find((c) => c.trim().startsWith("token="))
// //       ?.split("=")[1];

// //     if (!token) {
// //       return NextResponse.json(
// //         { error: "No autorizado: Token faltante" },
// //         { status: 401 },
// //       );
// //     }

// //     const secret = new TextEncoder().encode(process.env.JWT_SECRET);
// //     const { payload } = await jwtVerify(token, secret);

// //     // Asumimos que tu JWT tiene estas propiedades
// //     const userId = payload.sub as string;
// //     const userName = (payload.name as string) || "Admin";
// //     const role = (payload.role as string) || "adminleads";

// //     // 2. Obtener datos del cuerpo de la petición
// //     const body = await request.json();
// //     const { leadId, newSellerId } = body;

// //     if (!leadId || !newSellerId) {
// //       return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
// //     }

// //     // 3. Ejecutar actualización y auditoría en una transacción (lógica simple)
// //     // Actualizamos el lead
// //     const updateLeadSql = `UPDATE leads SET seller_id = ? WHERE id = ?`;
// //     await query(updateLeadSql, [newSellerId, leadId]);

// //     // Registrar en el log de auditoría
// //     const logSql = `
// //       INSERT INTO audit_logs (user_id, user_name, role, action, target_id, changes)
// //       VALUES (?, ?, ?, ?, ?, ?)
// //     `;

// //     const changes = JSON.stringify({
// //       field: "seller_id",
// //       new_value: newSellerId,
// //       lead_id: leadId,
// //     });

// //     await query(logSql, [userId, userName, role, "REASSIGN", leadId, changes]);

// //     return NextResponse.json({
// //       success: true,
// //       message: "Lead reasignado y auditado correctamente",
// //     });
// //   } catch (error: any) {
// //     console.error("Error crítico en API de reasignación:", error);

// //     // Manejo de errores específicos de JWT
// //     if (error.code === "ERR_JWS_INVALID" || error.code === "ERR_JWT_EXPIRED") {
// //       return NextResponse.json(
// //         { error: "Sesión inválida o expirada" },
// //         { status: 401 },
// //       );
// //     }

// //     return NextResponse.json(
// //       { error: "Error interno del servidor" },
// //       { status: 500 },
// //     );
// //   }
// // }
// import { query } from "@/lib/db";
// import { jwtVerify } from "jose";
// import { NextResponse } from "next/server";

// export async function PATCH(request: Request) {
//   try {
//     // 1. Extraer y verificar token
//     const cookieHeader = request.headers.get("cookie");
//     const token = cookieHeader
//       ?.split(";")
//       .find((c) => c.trim().startsWith("token="))
//       ?.split("=")[1];

//     if (!token) {
//       return NextResponse.json({ error: "No autorizado" }, { status: 401 });
//     }

//     const secret = new TextEncoder().encode(process.env.JWT_SECRET);
//     const { payload } = await jwtVerify(token, secret);

//     // 2. Extraer datos con validación segura
//     const body = await request.json();
//     const { leadId, newSellerId } = body;

//     if (!leadId || !newSellerId) {
//       return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
//     }

//     // 3. Ejecutar actualización
//     // Si leadId o newSellerId fueran undefined aquí, el if de arriba los atrapó.
//     await query(`UPDATE leads SET seller_id = ? WHERE id = ?`, [
//       newSellerId,
//       leadId,
//     ]);

//     // 4. Auditoría (Asegurando valores definidos)
//     const logSql = `
//       INSERT INTO audit_logs (user_id, user_name, role, action, target_id, changes)
//       VALUES (?, ?, ?, ?, ?, ?)
//     `;

//     // Convertimos a string y aseguramos que si alguna variable es undefined, sea null
//     const userId = (payload.sub as string) || "system";
//     const userName = (payload.name as string) || "Admin";
//     const role = (payload.role as string) || "adminleads";
//     const changes = JSON.stringify({
//       field: "seller_id",
//       new_value: newSellerId,
//       lead_id: leadId,
//     });

//     // Enviar valores garantizados (Si alguno sigue siendo undefined, forzamos null)
//     await query(logSql, [
//       userId,
//       userName,
//       role,
//       "REASSIGN",
//       leadId ?? null,
//       changes,
//     ]);

//     return NextResponse.json({ success: true });
//   } catch (error: any) {
//     console.error("❌ Error crítico en API de reasignación:", error);
//     return NextResponse.json(
//       { error: "Error interno del servidor" },
//       { status: 500 },
//     );
//   }
// }
import { query } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";

declare global {
  var io: any;
}

export async function PATCH(request: NextRequest) {
  const auth = await requireRoles(request, ["adminleads"]);
  if (auth.error) return auth.error;

  try {
    const payload = auth.payload!;
    const userCids = payload.cids as number;
    const userRole = ((payload.role as string) || "").toLowerCase().trim();

    // 2. Obtener datos
    const body = await request.json();
    const { leadId, newSellerId } = body;

    // 3. CONSULTA DE LECTURA: Obtener datos ANTES del cambio
    // Hacemos JOIN con la tabla sellers para obtener los CIDS
    const leadDataSql = `
      SELECT l.seller_id, l.name as lead_name,
             l.nombre_contacto, l.telefono, l.rif,
             l.ubicacion_estado, l.ubicacion_detalle,
             l.canal_origen, l.campana, l.status,
             s1.name as old_seller_name, s1.cids as old_seller_cids,
             s2.name as new_seller_name, s2.cids as new_seller_cids
      FROM leads l
      LEFT JOIN sellers s1 ON l.seller_id = s1.id
      LEFT JOIN sellers s2 ON s2.id = ?
      WHERE l.id = ?
    `;

    const leadData: any = await query(leadDataSql, [newSellerId, leadId]);
    const currentLead = Array.isArray(leadData)
      ? leadData[0]
      : (leadData as any).rows[0];

    if (!currentLead)
      return NextResponse.json(
        { error: "Lead no encontrado" },
        { status: 404 },
      );

    // Simetrico para las 3 sucursales, no solo Panama (antes cids 9/10
    // podian reasignar leads a cualquier vendedor de cualquier sucursal;
    // superadmin sigue sin restriccion de sucursal).
    if (userRole !== "superadmin" && userCids && currentLead.new_seller_cids !== userCids)
      return NextResponse.json(
        { error: "No autorizado: el vendedor no pertenece a tu sucursal" },
        { status: 403 },
      );

    // 4. Ejecutar actualización
    await query(`UPDATE leads SET seller_id = ? WHERE id = ?`, [
      newSellerId,
      leadId,
    ]);

    // 5. Auditoría DETALLADA
    const logSql = `
      INSERT INTO audit_logs (user_id, user_name, role, action, lead_id, changes)
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    const changes = JSON.stringify({
      lead_name: currentLead.lead_name,
      from: {
        seller_name: currentLead.old_seller_name || "Sin asignar",
        cids: currentLead.old_seller_cids || "N/A",
      },
      to: {
        seller_name: currentLead.new_seller_name,
        cids: currentLead.new_seller_cids,
      },
    });

    const userId = payload.sub as string;

    await query(logSql, [
      userId,
      payload.name,
      payload.role,
      "REASSIGN",
      leadId,
      changes,
    ]);

    if (global.io) {
      global.io.emit("leads-updated", {
        action: "REASSIGN",
        leadId,
        newSellerId,
      });
    }

    // Notificar a n8n con datos de reasignación
    if (process.env.N8N_REASSIGN_WEBHOOK_URL) {
      fetch(process.env.N8N_REASSIGN_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          evento: "lead_reasignado",
          lead: {
            lead_id: leadId,
            nombre_contacto: currentLead.nombre_contacto ?? "",
            empresa: currentLead.lead_name ?? "",
            telefono: currentLead.telefono ?? "",
            rif: currentLead.rif ?? "",
            ubicacion_estado: currentLead.ubicacion_estado ?? "",
            ubicacion_detalle: currentLead.ubicacion_detalle ?? "",
            canal_origen: currentLead.canal_origen ?? "",
            campana: currentLead.campana ?? "",
            status: currentLead.status ?? "",
          },
          vendedor_anterior: {
            seller_id: currentLead.seller_id ?? null,
            nombre: currentLead.old_seller_name || "Sin asignar",
          },
          vendedor_nuevo: {
            seller_id: newSellerId,
            nombre: currentLead.new_seller_name || "Sin asignar",
          },
        }),
      }).catch((err) =>
        console.error("Error al notificar n8n (reasignación):", err),
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("❌ Error en reasignación:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
