import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";

/**
 * Guard de las rutas de API del rol Seguridad.
 *
 * Vive acá y no copiado en cada ruta por una razón concreta: estaba duplicado
 * idéntico en 14 archivos y en el quince —/api/seguridad/almacenistas— se
 * olvidó, así que ese endpoint devolvía nombres de empleados y sus
 * calificaciones a cualquiera sin pedir sesión.
 *
 * Con `matcher` excluyendo /api, el middleware NO protege estas rutas: cada
 * una tiene que llamar a esto explícitamente. Si agregas un endpoint bajo
 * /api/seguridad, empieza por aquí.
 *
 * La verificación en sí está en `lib/auth/roles.ts`, que es la misma que usan
 * las rutas de otros roles (superadmin sigue entrando siempre).
 */
export async function requireSeguridad(
  request: NextRequest,
): Promise<{ payload?: any; error?: NextResponse }> {
  return requireRoles(request, ["seguridad"]);
}

/**
 * Guard de las rutas que tambien puede tocar el rol `almacen` (issue #42).
 *
 * Almacen prepara el egreso de mercancia — busca la orden de despacho, junta
 * facturas, asigna almacenista(s) — y se lo entrega a Seguridad, que lo
 * verifica en el porton. Solo las rutas de esa preparacion usan este guard;
 * la verificacion, las firmas y todo RMA siguen siendo `requireSeguridad`
 * exclusivo. Mezclar los dos roles en el mismo guard por descuido es
 * exactamente el tipo de error que este archivo existe para evitar.
 */
export async function requireAlmacenOSeguridad(
  request: NextRequest,
): Promise<{ payload?: any; error?: NextResponse }> {
  return requireRoles(request, ["seguridad", "almacen"]);
}

/**
 * Resuelve la sucursal (`cids`) de la sesion para filtrar datos por ella.
 *
 * Cada usuario de `seguridad`/`almacen` solo debe ver lo de su sucursal
 * (9=Valencia, 10=Caracas, 7=Panama) — el modulo entero no filtraba por esto
 * hasta ahora, asi que cualquiera veia todas las sucursales. `superadmin` es
 * la unica excepcion: ve todo, por eso devuelve `cids: null` ("sin filtro"),
 * mismo significado que ya usan otros modulos (ej. gerente_venta/inventario).
 *
 * Si el usuario no es superadmin y no tiene `cids` asignado en `users_config`,
 * se corta con 403 en vez de dejarlo pasar sin filtro — lo contrario seria
 * mostrarle todas las sucursales por un dato mal cargado.
 */
export function resolverCidsSesion(
  payload: any,
): { cids: number | null; error?: NextResponse } {
  const rol = String(payload?.role || "").toLowerCase().trim();
  if (rol === "superadmin") return { cids: null };

  const cids = Number(payload?.cids);
  if (!Number.isFinite(cids) || cids <= 0) {
    return {
      cids: null,
      error: NextResponse.json(
        { error: "Tu usuario no tiene una sucursal (cids) asignada" },
        { status: 403 },
      ),
    };
  }
  return { cids };
}
