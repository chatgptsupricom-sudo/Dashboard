import { NextResponse } from "next/server";

/**
 * Límite de peticiones para los endpoints públicos del portal (issue #25).
 *
 * Sin esto, cualquiera puede iterar números de factura y armarse una lista de
 * clientes de Supricom con lo que cada uno compró, y de paso degradar el Odoo
 * que usa toda la empresa para facturar: cada consulta encadena varias
 * llamadas RPC contra producción.
 *
 * ── Limitación conocida ──────────────────────────────────────────────────
 * El contador vive en memoria del proceso. Si algún día el panel corre en más
 * de una instancia, cada una llevará su propia cuenta y el límite real será el
 * configurado multiplicado por el número de instancias. Hoy corre en un solo
 * contenedor, y el proyecto no tiene Redis. Si eso cambia, esto hay que
 * moverlo a un almacén compartido.
 */

/** Ventana deslizante: guardamos las marcas de tiempo de cada petición. */
const registros = new Map<string, number[]>();

/**
 * Tope de llaves distintas. Alguien rotando IPs podría llenar la memoria del
 * proceso, que sería una forma de tumbar el servidor usando el propio
 * mecanismo que lo protege. Al pasarse, se descarta la mitad más antigua.
 */
const MAX_LLAVES = 20_000;

function podar(ahora: number) {
  if (registros.size <= MAX_LLAVES) return;
  const entradas = [...registros.entries()].sort(
    (a, b) => Math.max(...a[1], 0) - Math.max(...b[1], 0),
  );
  for (const [llave] of entradas.slice(0, Math.floor(entradas.length / 2))) {
    registros.delete(llave);
  }
}

/**
 * IP real del cliente detrás del proxy.
 *
 * `X-Forwarded-For` es una lista `cliente, proxy1, proxy2...`. Cada salto
 * AÑADE la dirección desde la que le llegó la petición, así que el valor que
 * agregó NUESTRO proxy es el que está más a la derecha, y todo lo que venga
 * antes lo pudo escribir el propio cliente.
 *
 * Por eso se cuenta desde el final: tomar el primer elemento —que es lo que
 * casi todos los ejemplos de internet hacen— deja el límite en nada, porque
 * basta con mandar una cabecera falsa distinta en cada petición.
 *
 * PROXY_HOPS_CONFIABLES es cuántos saltos nuestros hay delante. Con EasyPanel
 * (Traefik) es 1. Si algún día se mete Cloudflare u otro proxy delante, hay
 * que subirlo, o el límite volverá a ser esquivable.
 */
export function obtenerIp(request: Request): string {
  const saltos = Math.max(
    1,
    parseInt(process.env.PROXY_HOPS_CONFIABLES || "1", 10) || 1,
  );

  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const cadena = xff
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    if (cadena.length) {
      const indice = Math.max(0, cadena.length - saltos);
      return cadena[indice];
    }
  }

  // Traefik y nginx suelen mandar también esta, que no es una lista y por
  // tanto no se puede prefijar con basura.
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();

  return "desconocida";
}

export interface Limite {
  /** Peticiones permitidas dentro de la ventana. */
  max: number;
  /** Tamaño de la ventana en segundos. */
  ventanaSegundos: number;
}

export interface ResultadoLimite {
  ok: boolean;
  restantes: number;
  esperaSegundos: number;
}

export function limitar(llave: string, limite: Limite): ResultadoLimite {
  const ahora = Date.now();
  const desde = ahora - limite.ventanaSegundos * 1000;

  const previas = (registros.get(llave) || []).filter((t) => t > desde);

  if (previas.length >= limite.max) {
    const masAntigua = previas[0];
    const espera = Math.ceil(
      (masAntigua + limite.ventanaSegundos * 1000 - ahora) / 1000,
    );
    registros.set(llave, previas);
    return { ok: false, restantes: 0, esperaSegundos: Math.max(1, espera) };
  }

  previas.push(ahora);
  registros.set(llave, previas);
  podar(ahora);

  return {
    ok: true,
    restantes: limite.max - previas.length,
    esperaSegundos: 0,
  };
}

/**
 * Aplica uno o varios límites a la misma petición. Sirve para combinar un
 * tope por minuto con otro por hora: el primero corta las ráfagas y el
 * segundo el goteo sostenido, que es como se raspa un catálogo sin que se
 * note.
 */
export function aplicarLimites(
  request: Request,
  nombre: string,
  limites: Limite[],
): NextResponse | null {
  const ip = obtenerIp(request);

  for (const limite of limites) {
    const llave = `${nombre}:${limite.ventanaSegundos}:${ip}`;
    const resultado = limitar(llave, limite);
    if (!resultado.ok) {
      console.warn(
        `[limite] ${nombre} bloqueado para ${ip} (${limite.max}/${limite.ventanaSegundos}s)`,
      );
      return respuesta429(resultado.esperaSegundos);
    }
  }

  return null;
}

export function respuesta429(esperaSegundos: number): NextResponse {
  return NextResponse.json(
    {
      error:
        "Demasiadas solicitudes. Espera un momento y vuelve a intentarlo.",
    },
    {
      status: 429,
      headers: { "Retry-After": String(esperaSegundos) },
    },
  );
}
