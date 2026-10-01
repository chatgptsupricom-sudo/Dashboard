import { query } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";

// Crea la tabla si no existe
async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS lead_statuses (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(50) NOT NULL UNIQUE,
      color VARCHAR(20) NOT NULL DEFAULT '#6b7280',
      order_index INT NOT NULL DEFAULT 0,
      is_default TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  // Insertar los estados por defecto si la tabla está vacía
  await query(`
    INSERT IGNORE INTO lead_statuses (name, color, order_index, is_default) VALUES
    ('NUEVO', '#3b82f6', 1, 1),
    ('CONTACTADO', '#f59e0b', 2, 1),
    ('CERRADO', '#6b7280', 3, 1)
  `);
}

export async function GET() {
  try {
    await ensureTable();
    const result: any = await query(
      "SELECT * FROM lead_statuses ORDER BY order_index ASC"
    );
    const rows = Array.isArray(result) ? result : result.rows;
    return NextResponse.json(rows || []);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireRoles(request, ["adminleads"]);
  if (auth.error) return auth.error;

  try {
    await ensureTable();
    const { name, color } = await request.json();
    if (!name?.trim()) {
      return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });
    }
    const normalized = name.trim().toUpperCase().replace(/\s+/g, "_");

    // Obtener el order_index de CERRADO para insertar antes de él
    const cerradoResult: any = await query(
      "SELECT id, order_index FROM lead_statuses WHERE name = 'CERRADO'"
    );
    const cerradoRows = Array.isArray(cerradoResult) ? cerradoResult : cerradoResult.rows;
    const cerradoOrder = parseInt(cerradoRows?.[0]?.order_index) || 999;
    const cerradoId = cerradoRows?.[0]?.id;

    // Empujar CERRADO un lugar más arriba
    if (cerradoId) {
      await query("UPDATE lead_statuses SET order_index = order_index + 1 WHERE order_index >= ?", [cerradoOrder]);
    }

    await query(
      "INSERT INTO lead_statuses (name, color, order_index, is_default) VALUES (?, ?, ?, 0)",
      [normalized, color || "#6b7280", cerradoOrder]
    );
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    if (error.message?.includes("Duplicate")) {
      return NextResponse.json({ error: "Ya existe un estado con ese nombre" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireRoles(request, ["adminleads"]);
  if (auth.error) return auth.error;

  try {
    const { id } = await request.json();
    // No permitir borrar estados por defecto
    const result: any = await query("SELECT is_default FROM lead_statuses WHERE id = ?", [id]);
    const rows = Array.isArray(result) ? result : result.rows;
    if (rows?.[0]?.is_default) {
      return NextResponse.json({ error: "No se pueden eliminar los estados predeterminados" }, { status: 403 });
    }
    await query("DELETE FROM lead_statuses WHERE id = ?", [id]);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireRoles(request, ["adminleads"]);
  if (auth.error) return auth.error;

  try {
    const { id, color, swap_with } = await request.json();

    if (color !== undefined) {
      await query("UPDATE lead_statuses SET color = ? WHERE id = ?", [color, id]);
    }

    // swap_with: id del otro status con el que intercambiar posición
    if (swap_with !== undefined) {
      const result: any = await query(
        "SELECT id, order_index, is_default, name FROM lead_statuses WHERE id IN (?, ?)",
        [id, swap_with]
      );
      const rows = Array.isArray(result) ? result : result.rows;
      if (rows.length !== 2) return NextResponse.json({ error: "IDs no encontrados" }, { status: 404 });

      const a = rows.find((r: any) => r.id === id);
      const b = rows.find((r: any) => r.id === swap_with);

      // No permitir mover más allá de CONTACTADO ni de CERRADO
      if (b.name === "CONTACTADO" || b.name === "NUEVO" || b.name === "CERRADO") {
        return NextResponse.json({ error: "No se puede mover fuera del rango permitido" }, { status: 403 });
      }

      await query("UPDATE lead_statuses SET order_index = ? WHERE id = ?", [b.order_index, a.id]);
      await query("UPDATE lead_statuses SET order_index = ? WHERE id = ?", [a.order_index, b.id]);
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
