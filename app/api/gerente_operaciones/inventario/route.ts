import { GET as inventarioGerente } from "@/app/api/gerente_venta/inventario/route";
import { NextRequest } from "next/server";

// Sin uso desde las pantallas (Gerente de Operaciones lee
// /api/gerente_venta/inventario); se deja como el mismo endpoint.
export async function GET(request: NextRequest) {
  return inventarioGerente(request);
}
