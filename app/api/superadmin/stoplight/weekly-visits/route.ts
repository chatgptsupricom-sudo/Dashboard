import { query } from "@/lib/db";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { writeFile, unlink, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "GzC8WCMdNfmi9qX7Oj01U/FTwaOAOwMh5EYE8VukFM8=",
);

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "visitas");

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
      const ext = photo.name.split(".").pop() || "jpg";
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const filePath = path.join(UPLOAD_DIR, filename);
      const buffer = Buffer.from(await photo.arrayBuffer());
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

    await jwtVerify(token, JWT_SECRET);

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
      if (existsSync(filePath)) await unlink(filePath);
    }

    await query(`DELETE FROM weekly_visits WHERE id = ?`, [id]);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error en API weekly_visits DELETE:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
