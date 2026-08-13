import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const META_FILE = path.join(process.cwd(), "uploads", "custom-views", "adminleads.meta.json");

export async function GET() {
  if (!existsSync(META_FILE)) {
    return NextResponse.json({ exists: false });
  }
  try {
    const raw = await readFile(META_FILE, "utf-8");
    const meta = JSON.parse(raw);
    return NextResponse.json({ exists: true, ...meta });
  } catch {
    return NextResponse.json({ exists: false });
  }
}
