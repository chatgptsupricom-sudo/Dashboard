import { query } from "@/lib/db";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { writeFile, unlink, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { jwtSecretBytes } from "@/lib/secretos";

const JWT_SECRET = jwtSecretBytes();

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "visitas");

// El nombre de archivo que manda el cliente nunca es confiable (permite
// path traversal, ver issue de seguridad). El tipo real se detecta por los
// primeros bytes, igual que en banco-imagenes/ticket-adjuntos, y la
// extensión sale de una tabla fija a partir de ese tipo detectado — nunca
// del nombre original.
function detectImageMime(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) return "image/png";
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return "image/webp";
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return "image/gif";
  return null;
}

const EXT_POR_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

// Defensa en profundidad: aunque el nombre ya no venga del cliente, se
// confirma que la ruta final sigue dentro de UPLOAD_DIR antes de escribir
// o borrar.
function rutaDentroDe(base: string, target: string): boolean {
  const resolved = path.resolve(target);
  return resolved === path.resolve(base) || resolved.startsWith(path.resolve(base) + path.sep);
}

async function ensureTable() {
  await query(`CREATE TABLE IF NOT EXISTS weekly_visits (
    id INT AUTO_INCREMENT PRIMARY KEY,
    seller_name VARCHAR(255) NOT NULL,
    client_name VARCHAR(255) NOT NULL,
    is_prospect TINYINT(1) DEFAULT 0,
    visit_date DATE NOT NULL,
    photo_url TEXT,
    company_id INT NOT NULL,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
}

async function ensureUploadDir() {
  if (!existsSync(UPLOAD_DIR)) {
    await mkdir(UPLOAD_DIR, { recursive: true });
  }
}

// GET: List visits for a period
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token)
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { payload } = await jwtVerify(token, JWT_SECRET);
    // Mismo criterio de lectura que superadmin/stoplight/route.ts: el POST/DELETE
    // de este archivo ya tenian su lista de roles, a este GET se le habia
    // quedado afuera (cualquier autenticado veia visitas de cualquier sucursal).
    const userRoleGet = ((payload.role as string) || "").toLowerCase().trim();
    const rolesConLectura = ["superadmin", "gerencia de ventas", "compras", "cuentas por cobrar", "gerente de operaciones"];
    if (!rolesConLectura.includes(userRoleGet)) {
      return NextResponse.json({ error: "Permisos insuficientes" }, { status: 403 });
    }

    const url = new URL(request.url);
    const companyIdParam = url.searchParams.get("company_id");
    const mesParam = url.searchParams.get("mes");
    const companyId = companyIdParam ? parseInt(companyIdParam, 10) : (payload.cids as number);

    const now = new Date();
    const mes = mesParam || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const [anioStr, mesStr] = mes.split("-");
    const anio = parseInt(anioStr, 10);
    const mesNum = parseInt(mesStr, 10);

    const fechaInicio = `${anio}-${String(mesNum).padStart(2, "0")}-01`;
    const ultimoDia = new Date(anio, mesNum, 0).getDate();
    const fechaFin = `${anio}-${String(mesNum).padStart(2, "0")}-${ultimoDia}`;

    await ensureTable();

    const result = await query(
      `SELECT id, seller_name, client_name, is_prospect, visit_date, photo_url, created_at
       FROM weekly_visits
       WHERE company_id = ? AND visit_date >= ? AND visit_date <= ?
       ORDER BY visit_date DESC`,
      [companyId, fechaInicio, fechaFin]
    );

    return NextResponse.json({
      success: true,
      data: result.rows,
    });
  } catch (error: any) {
    console.error("Error en API weekly_visits GET:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

// POST: Create a new visit with optional photo upload
export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token)
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userRole = ((payload.role as string) || "").toLowerCase().trim();
    // Lista de permitidos (igual que el GET de app/api/superadmin/stoplight/
    // route.ts, sin "gerente de operaciones" — ese rol es de solo lectura
    // aca) en vez de bloquear un solo rol: antes cualquier OTRO rol
    // autenticado (seguridad, rma...) tambien podia escribir.
    const rolesConEscritura = ["superadmin", "gerencia de ventas", "compras", "cuentas por cobrar"];
    if (!rolesConEscritura.includes(userRole)) {
      return NextResponse.json({ error: "Permisos insuficientes" }, { status: 403 });
    }

    const formData = await request.formData();
    const seller_name = formData.get("seller_name") as string;
    const client_name = formData.get("client_name") as string;
    const is_prospect = formData.get("is_prospect") === "true";
    const visit_date = formData.get("visit_date") as string;
    const company_id = parseInt(formData.get("company_id") as string, 10);
    const photo = formData.get("photo") as File | null;

    if (!seller_name || !client_name || !visit_date || !company_id) {
      return NextResponse.json({ error: "Faltan campos obligatorios" }, { status: 400 });
    }

    await ensureTable();
    await ensureUploadDir();

    let photoUrl: string | null = null;

    if (photo && photo.size > 0) {
      const buffer = Buffer.from(await photo.arrayBuffer());
      const mime = detectImageMime(buffer);
      if (!mime) {
        return NextResponse.json({ error: "La foto debe ser una imagen JPEG, PNG, WebP o GIF válida" }, { status: 400 });
      }
      const ext = EXT_POR_MIME[mime];
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const filePath = path.join(UPLOAD_DIR, filename);
      if (!rutaDentroDe(UPLOAD_DIR, filePath)) {
        return NextResponse.json({ error: "Nombre de archivo inválido" }, { status: 400 });
      }
      await writeFile(filePath, buffer);
      photoUrl = `/uploads/visitas/${filename}`;
    }

    await query(
      `INSERT INTO weekly_visits (seller_name, client_name, is_prospect, visit_date, photo_url, company_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [seller_name, client_name, is_prospect ? 1 : 0, visit_date, photoUrl, company_id, payload.uid]
    );

    return NextResponse.json({ success: true, photo_url: photoUrl });
  } catch (error: any) {
    console.error("Error en API weekly_visits POST:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

// DELETE: Remove a visit and its photo
export async function DELETE(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token)
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userRole = ((payload.role as string) || "").toLowerCase().trim();
    const rolesConEscritura = ["superadmin", "gerencia de ventas", "compras", "cuentas por cobrar"];
    if (!rolesConEscritura.includes(userRole)) {
      return NextResponse.json({ error: "Permisos insuficientes" }, { status: 403 });
    }

    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Falta ID" }, { status: 400 });
    }

    await ensureTable();

    const existing = await query(`SELECT photo_url FROM weekly_visits WHERE id = ?`, [id]);
    const row = existing.rows?.[0];
    if (row?.photo_url) {
      const filePath = path.join(process.cwd(), "public", row.photo_url);
      if (rutaDentroDe(UPLOAD_DIR, filePath) && existsSync(filePath)) await unlink(filePath);
    }

    await query(`DELETE FROM weekly_visits WHERE id = ?`, [id]);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error en API weekly_visits DELETE:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
