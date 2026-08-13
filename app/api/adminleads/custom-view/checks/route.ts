import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const STORAGE_DIR = path.join(process.cwd(), "uploads", "custom-views");
const CHECKS_FILE = path.join(STORAGE_DIR, "adminleads.checks.json");

declare global { var io: any; }

async function ensureDir() {
  if (!existsSync(STORAGE_DIR)) await mkdir(STORAGE_DIR, { recursive: true });
}

export async function GET() {
  if (!existsSync(CHECKS_FILE)) {
    return NextResponse.json({ checks: {} });
  }
  try {
    const raw = await readFile(CHECKS_FILE, "utf-8");
    return NextResponse.json({ checks: JSON.parse(raw) });
  } catch {
    return NextResponse.json({ checks: {} });
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureDir();
    const checks = await request.json();
    await writeFile(CHECKS_FILE, JSON.stringify(checks), "utf-8");
    if (global.io) {
      global.io.emit("vista-checks-updated", { checks });
    }
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
