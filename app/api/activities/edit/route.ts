import { query } from "@/lib/db";
import { requireSession } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";

// Sincronización con la declaración global de WebSockets del proyecto
declare global {
  var io: any;
}

export async function PUT(req: NextRequest) {
  const auth = await requireSession(req);
  if (auth.error) return auth.error;

  try {
    const body = await req.json();

    // Extraemos todos los campos mapeados directamente desde tu EditActivityModal
    const { id, title, description, due_date, observacion } = body;

    // Guardas de seguridad básicas
    if (!id) {
      return NextResponse.json(
        { error: "El ID de la actividad es estrictamente requerido." },
        { status: 400 },
      );
    }

    if (!title || title.trim() === "") {
      return NextResponse.json(
        { error: "El título de la actividad no puede quedar vacío." },
        { status: 400 },
      );
    }

    // Solo el dueño de la tarea, quien la asigno o superadmin pueden
    // editarla (mismo criterio que app/api/activities/route.ts PATCH).
    const ownerRows = await query("SELECT user_id, assigned_by FROM activities WHERE id = ?", [id]);
    const activity = ownerRows.rows?.[0];
    if (!activity) {
      return NextResponse.json({ error: "Actividad no encontrada" }, { status: 404 });
    }
    const callerRole = ((auth.payload!.role as string) || "").toLowerCase().trim();
    const callerId = String(auth.payload!.sub ?? auth.payload!.uid ?? "");
    const callerName = ((auth.payload!.name as string) || "").trim().toLowerCase();
    const isOwner = String(activity.user_id) === callerId;
    const isAssigner = ((activity.assigned_by as string) || "").trim().toLowerCase() === callerName;
    if (callerRole !== "superadmin" && !isOwner && !isAssigner) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    // Formateamos la fecha: si el input date del modal viene vacío, mandamos NULL a MySQL
    const formattedDueDate =
      due_date && due_date.trim() !== "" ? due_date : null;

    // Ejecutamos la actualización limpia de los campos del modal
    const sql = `
      UPDATE activities
      SET
        title = ?,
        description = ?,
        due_date = ?,
        observacion = ?
      WHERE id = ?
    `;

    await query(sql, [
      title.trim(),
      description ? description.trim() : "",
      formattedDueDate,
      observacion ? observacion.trim() : "",
      id,
    ]);

    // Disparamos la notificación en tiempo real si WebSockets está activo en tu servidor
    if (global.io) {
      global.io.emit("activity-updated", {
        action: "MODAL_FIELDS_EDITED",
        id,
      });
    }

    return NextResponse.json({
      success: true,
      message: "Actividad actualizada correctamente",
    });
  } catch (error: any) {
    console.error("❌ Error en API /activities/edit:", error);
    return NextResponse.json(
      {
        error:
          "Error interno al procesar la actualización en la base de datos.",
      },
      { status: 500 },
    );
  }
}
