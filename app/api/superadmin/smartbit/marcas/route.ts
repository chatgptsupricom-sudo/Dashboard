import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { asignarMarcasSmartbit } from "@/lib/smartbit";

export const dynamic = "force-dynamic";

// Llena ventas_smartbit.marca cruzando el código del artículo con Odoo
// (lib/smartbit.ts). Requiere sql/ventas_smartbit_marca.sql.
//
//   POST { todas?: boolean } -> arranca en segundo plano (202); sin `todas`,
//                               solo los renglones sin revisar (marca NULL)
//   GET                      -> avance y resultado
//
// ponytail: estado en memoria del proceso, igual que smartbit/importar; si el
// servidor se reinicia a mitad basta con volver a correrlo.
let estado: {
  corriendo: boolean;
  todas?: boolean;
  inicio?: string;
  fin?: string;
  codigosHechos?: number;
  codigosTotal?: number;
  resultado?: { codigos: number; conMarca: number; sinMarca: number; renglones: number };
  error?: string;
} = { corriendo: false };

export async function POST(request: NextRequest) {
  const auth = await requireRoles(request, ["superadmin"]);
  if (auth.error) return auth.error;
  if (estado.corriendo) return NextResponse.json({ error: "Ya hay un cruce corriendo", estado }, { status: 409 });

  const body = await request.json().catch(() => ({}));
  estado = { corriendo: true, todas: !!body.todas, inicio: new Date().toISOString() };
  void asignarMarcasSmartbit(!!body.todas, (hechos, total) => {
    estado.codigosHechos = hechos;
    estado.codigosTotal = total;
  })
    .then((r) => {
      estado.resultado = r;
      console.log("[smartbit] marcas asignadas:", r);
    })
    .catch((e) => {
      console.error("[smartbit] cruce de marcas:", e);
      estado.error = e?.code === "ER_BAD_FIELD_ERROR" ? "Falta la columna marca: corre sql/ventas_smartbit_marca.sql" : e?.message || "error";
    })
    .finally(() => {
      estado.corriendo = false;
      estado.fin = new Date().toISOString();
    });

  return NextResponse.json({ iniciado: true, estado }, { status: 202 });
}

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["superadmin"]);
  if (auth.error) return auth.error;
  return NextResponse.json(estado);
}
