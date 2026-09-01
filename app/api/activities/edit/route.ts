import { db } from "@/lib/db";
import { requireRoles } from "@/lib/auth/roles";
import { UserRole } from "@/lib/types";
import { NextRequest, NextResponse } from "next/server";

// Sincronización con la declaración global de WebSockets del proyecto
declare global {
  var io: any;
}

export async function PUT(req: NextRequest) {
  const auth = await requireRoles(req, Object.values(UserRole));
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

    // Formateamos la fecha: si el input date del modal viene vacío, mandamos NULL a MySQL
    const formattedDueDate =
      due_date && due_date.trim() !== "" ? due_date : null;

    // Ejecutamos la actualización limpia de los campos del modal
    const query = `
      UPDATE activities
      SET
        title = ?,
        description = ?,
        due_date = ?,
        observacion = ?
      WHERE id = ?
    `;

    await db.execute(query, [
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
