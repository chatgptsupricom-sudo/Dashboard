/**
 * Cola de ingresos pendientes de enviar (issue #39).
 *
 * El mostrador se usa de pie, en el almacen, con la señal que haya. La mitad
 * de lectura ya estaba: el mostrador guarda lo ultimo que leyo y lo pinta sin
 * conexion. Esto es la otra mitad — poder REGISTRAR un ingreso con el cliente
 * delante aunque no haya red, y que salga solo cuando vuelva.
 *
 * ## Por que IndexedDB y no localStorage
 *
 * El resto del modulo cachea en `localStorage`, pero aqui hay una foto del
 * estado del equipo, que es un File de varios MB. `localStorage` solo guarda
 * texto (habria que pasarla a base64, que la engorda un tercio) y su cuota
 * ronda los 5 MB para TODO el origen. Dos ingresos con foto la llenan, y al
 * llenarse falla tambien el cache de lectura del mostrador. IndexedDB guarda
 * Blobs tal cual y tiene cuota de disco.
 *
 * ## Por que cada ingreso lleva clave de idempotencia
 *
 * El caso malo no es "no hay red": es la red a medias. El telefono manda el
 * ingreso, el servidor lo guarda, y la respuesta se pierde de vuelta. La cola
 * no puede distinguir "no llego" de "llego y no me entere", asi que reintenta.
 * La clave se genera UNA vez, al encolar, y se reusa en cada reintento; el
 * endpoint devuelve el ingreso anterior en vez de crear otro. Sin eso quedan
 * dos actas de recepcion del mismo equipo y nadie sabe cual vale.
 *
 * ## Errores permanentes vs temporales
 *
 * Un 4xx no se arregla reintentando: el ingreso queda marcado como fallido y
 * se le enseña a una persona. Un fallo de red o un 5xx si se reintenta. La
 * diferencia importa porque un acta atascada en silencio es peor que un error
 * a la cara — el almacenista ya le dijo al cliente que quedo registrado.
 */

const DB_NOMBRE = "seguridad-mostrador";
const DB_VERSION = 1;
const ALMACEN = "ingresos-pendientes";

export type IngresoEncolado = {
  /** Autoincremental de IndexedDB. */
  id?: number;
  /** Se genera al encolar y NO cambia entre reintentos. */
  idempotency_key: string;
  payload: Record<string, unknown>;
  foto: Blob | null;
  foto_nombre: string | null;
  creado_at: number;
  intentos: number;
  /** Mensaje del ultimo fallo permanente. Si esta puesto, ya no se reintenta. */
  error: string | null;
};

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NOMBRE, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(ALMACEN)) {
        db.createObjectStore(ALMACEN, { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function conAlmacen<T>(
  modo: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  return abrir().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(ALMACEN, modo);
        const req = fn(tx.objectStore(ALMACEN));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => db.close();
      }),
  );
}

/** IndexedDB no existe en modo privado de algunos navegadores. */
export function hayCola(): boolean {
  return typeof indexedDB !== "undefined";
}

function nuevaClave(): string {
  // randomUUID solo existe en contexto seguro (https o localhost). El mostrador
  // se sirve por https, pero el respaldo evita que la cola se caiga entera si
  // alguien lo abre por http en la red local.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `k-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export async function encolar(
  payload: Record<string, unknown>,
  foto: File | null,
): Promise<number> {
  const registro: Omit<IngresoEncolado, "id"> = {
    idempotency_key: nuevaClave(),
    payload,
    foto: foto ?? null,
    foto_nombre: foto?.name ?? null,
    creado_at: Date.now(),
    intentos: 0,
    error: null,
  };
  return conAlmacen<number>("readwrite", (s) => s.add(registro));
}

export async function pendientes(): Promise<IngresoEncolado[]> {
  if (!hayCola()) return [];
  try {
    return await conAlmacen<IngresoEncolado[]>("readonly", (s) => s.getAll());
  } catch {
    return [];
  }
}

/** Cuantos quedan por salir, sin contar los que fallaron para siempre. */
export async function cuantosPendientes(): Promise<number> {
  return (await pendientes()).filter((i) => !i.error).length;
}

/** Los que necesitan que una persona los mire. */
export async function cuantosFallidos(): Promise<number> {
  return (await pendientes()).filter((i) => i.error).length;
}

async function borrar(id: number): Promise<void> {
  await conAlmacen("readwrite", (s) => s.delete(id));
}

async function guardar(registro: IngresoEncolado): Promise<void> {
  await conAlmacen("readwrite", (s) => s.put(registro));
}

export async function descartar(id: number): Promise<void> {
  await borrar(id);
  avisar();
}

export type ResultadoSync = {
  enviados: number;
  fallidos: number;
  pendientes: number;
};

let sincronizando = false;

/**
 * Intenta enviar todo lo encolado. Seguro de llamar varias veces: si ya hay
 * una pasada en curso, la segunda no hace nada.
 */
export async function sincronizar(): Promise<ResultadoSync> {
  if (!hayCola() || sincronizando) {
    return { enviados: 0, fallidos: 0, pendientes: await cuantosPendientes() };
  }
  sincronizando = true;
  let enviados = 0;
  let fallidos = 0;

  try {
    for (const registro of await pendientes()) {
      if (registro.error || registro.id === undefined) continue;

      try {
        const res = await fetch("/api/seguridad/ingreso", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...registro.payload,
            idempotency_key: registro.idempotency_key,
          }),
        });

        if (res.status >= 400 && res.status < 500) {
          // Permanente: reintentar da exactamente lo mismo. Se marca y se
          // deja de tocar, para que alguien lo vea en vez de girar en vano.
          const data = await res.json().catch(() => ({}));
          await guardar({
            ...registro,
            intentos: registro.intentos + 1,
            error: data.error || `HTTP ${res.status}`,
          });
          fallidos++;
          continue;
        }

        if (!res.ok) {
          // 5xx o similar: temporal, se reintenta en la proxima pasada.
          await guardar({ ...registro, intentos: registro.intentos + 1 });
          continue;
        }

        const data = await res.json();

        // La foto va aparte porque el endpoint del ingreso es JSON. Si falla,
        // el acta ya esta guardada: se pierde la foto, no el registro. Por eso
        // no se reintenta el ingreso entero por culpa de la foto.
        if (registro.foto && data?.id && !data?.duplicado) {
          try {
            const fd = new FormData();
            fd.append("foto", registro.foto, registro.foto_nombre || "foto.jpg");
            await fetch(`/api/seguridad/ingreso/${data.id}/foto`, {
              method: "POST",
              body: fd,
            });
          } catch {
            // Se sigue: el ingreso ya quedo registrado.
          }
        }

        await borrar(registro.id);
        enviados++;
      } catch {
        // Sin red: se queda en la cola tal cual, ni siquiera cuenta intento
        // fallido, porque no llego a haber respuesta del servidor.
        continue;
      }
    }
  } finally {
    sincronizando = false;
  }

  avisar();
  return { enviados, fallidos, pendientes: await cuantosPendientes() };
}

/** Evento para que las pantallas refresquen su contador. */
const EVENTO = "seguridad:cola-cambio";

function avisar() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EVENTO));
  }
}

export function alCambiarCola(fn: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENTO, fn);
  return () => window.removeEventListener(EVENTO, fn);
}

/**
 * Arranca el vaciado automatico: al volver la conexion y al cargar la pantalla.
 * Devuelve la funcion para desmontarlo.
 */
export function activarSincronizacionAutomatica(): () => void {
  if (typeof window === "undefined" || !hayCola()) return () => {};

  const alVolver = () => {
    void sincronizar();
  };

  window.addEventListener("online", alVolver);
  if (navigator.onLine) void sincronizar();

  return () => window.removeEventListener("online", alVolver);
}
