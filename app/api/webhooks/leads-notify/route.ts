import { NextResponse } from "next/server";

declare global {
  var io: any;
}

// Endpoint para que n8n (u otras automatizaciones) notifiquen
// al servidor cuando insertan un lead directamente en la BD.
// n8n debe hacer un POST a /api/webhooks/leads-notify con el header:
//   x-webhook-secret: <WEBHOOK_SECRET del .env>
export async function POST(request: Request) {
  const secret = request.headers.get("x-webhook-secret");

  if (!process.env.WEBHOOK_SECRET || secret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (global.io) {
    global.io.emit("leads-updated", { action: "WEBHOOK", source: "n8n" });
  }

  return NextResponse.json({ success: true });
}
