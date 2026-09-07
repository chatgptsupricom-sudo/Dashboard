import { NextRequest } from "next/server";

/**
 * Origen público de esta app tal y como lo ve el navegador
 * (ej. `https://panel.supricom.com.ve`).
 *
 * Detrás del proxy (Easypanel), `request.url` resuelve al host interno
 * (`localhost:3000`), que no sirve para nada que tenga que salir al mundo:
 * ni para que un tercero descargue un archivo nuestro, ni para que el
 * navegador abra un socket. El host real viaja en `x-forwarded-host`.
 */
export function getPublicOrigin(request: NextRequest): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`;
  return new URL(request.url).origin;
}
