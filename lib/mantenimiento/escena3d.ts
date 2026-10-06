import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

/**
 * El patio y el taller de Almacén en 3D: cada camión y cada montacargas es un
 * vehículo que se puede tocar, y está parado donde va su mantenimiento.
 *
 *   PATIO (operativos) → POR ATENDER (reportados) → TALLER (sobre el elevador)
 *   → LISTO (esperando la entrega) → de vuelta al PATIO.
 *
 * Los camiones que el despacho mandó a ruta salen a la calle del frente y
 * van pasando mientras estén fuera.
 *
 * Cuando una orden cambia de etapa, el vehículo maneja solo hasta su nuevo
 * puesto. Es three.js a mano, sin dependencias de React: la pantalla lo monta
 * en un <div> y le pasa la flota con `actualizar`.
 *
 * Solo navegador (usa WebGL y `document`): se carga con import() dinámico.
 */

export type SituacionEscena = "operativo" | "en_ruta" | "reportado" | "en_taller" | "listo";

export type VehiculoEscena = {
  id: number;
  tipo: "camion" | "montacargas";
  /** Placa o código: va en el rótulo sobre el vehículo. */
  codigo: string;
  situacion: SituacionEscena;
  /** Reportado con prioridad alta: la señal sale en rojo. */
  urgente?: boolean;
  /** Tareas hechas del taller, de 0 a 1: el aro de avance. */
  progreso?: number;
  /** Operativo con el servicio vencido o por vencer: aro ámbar en el piso. */
  aviso?: boolean;
};

export type OpcionesEscena = {
  onSeleccion: (id: number) => void;
  /** Rótulos pintados en el piso de cada zona. */
  textos: { patio: string; reportado: string; taller: string; listo: string; ruta: string };
  /** Sin animaciones de adorno (prefers-reduced-motion). */
  movimientoReducido?: boolean;
};

export type Escena = {
  actualizar: (vehiculos: VehiculoEscena[], seleccion: number | null) => void;
  destruir: () => void;
};

// ── Colores ────────────────────────────────────────────────────────────────
const VIOLETA = 0x741dfe;
const COLORES_CAMION = [0x2563eb, 0xdc2626, 0x059669, 0x0891b2, 0xea580c, 0x7c3aed, 0x475569];
const COLORES_MONTACARGAS = [0xf59e0b, 0xf97316, 0xeab308];
const ZONA = {
  operativo: 0x94a3b8,
  en_ruta: 0x0ea5e9,
  reportado: 0xf59e0b,
  en_taller: VIOLETA,
  listo: 0x10b981,
} as const;

// ── Distribución del patio (unidades ≈ metros) ─────────────────────────────
const PASO_X = 4.6;
const PASO_Z = 10;
const Z_FILA = -4;
const ZONAS: Record<SituacionEscena, { x0: number; columnas: number }> = {
  operativo: { x0: -29, columnas: 5 },
  // La calle: una sola fila, al frente.
  en_ruta: { x0: -30, columnas: 99 },
  reportado: { x0: -3.2, columnas: 2 },
  en_taller: { x0: 9.5, columnas: 3 },
  listo: { x0: 27.5, columnas: 1 },
};
const PASO_TALLER = 5.4;
const ALTURA_ELEVADOR = 1.25;
// La calle del frente, por donde pasan los que están en ruta.
const Z_RUTA = 8.4;
const BORDE_RUTA = 37;
const VELOCIDAD_RUTA = 6.5;

function puesto(situacion: SituacionEscena, indice: number): { x: number; z: number } {
  const zona = ZONAS[situacion];
  if (situacion === "en_ruta") return { x: zona.x0 + ((indice * 13) % (BORDE_RUTA * 2 - 8)), z: Z_RUTA };
  const paso = situacion === "en_taller" ? PASO_TALLER : PASO_X;
  return {
    x: zona.x0 + (indice % zona.columnas) * paso,
    z: Z_FILA + Math.floor(indice / zona.columnas) * PASO_Z,
  };
}

// ── Texturas dibujadas (rótulos e insignias) ───────────────────────────────
function lienzo(ancho: number, alto: number) {
  const c = document.createElement("canvas");
  c.width = ancho;
  c.height = alto;
  return { c, g: c.getContext("2d")! };
}

function rectRedondo(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** La placa: fondo blanco, borde oscuro, letras anchas. */
function texturaPlaca(texto: string): THREE.CanvasTexture {
  const { c, g } = lienzo(256, 96);
  rectRedondo(g, 6, 6, 244, 84, 18);
  g.fillStyle = "#ffffff";
  g.fill();
  g.lineWidth = 7;
  g.strokeStyle = "#0f172a";
  g.stroke();
  g.fillStyle = "#0f172a";
  g.textAlign = "center";
  g.textBaseline = "middle";
  let tam = 46;
  g.font = `700 ${tam}px ui-monospace, Menlo, Consolas, monospace`;
  while (g.measureText(texto).width > 216 && tam > 18) {
    tam -= 2;
    g.font = `700 ${tam}px ui-monospace, Menlo, Consolas, monospace`;
  }
  g.fillText(texto, 128, 50);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** La insignia que flota sobre el vehículo: qué le pasa, de un vistazo. */
function dibujarInsignia(
  g: CanvasRenderingContext2D,
  situacion: SituacionEscena,
  urgente: boolean,
  progreso: number,
) {
  g.clearRect(0, 0, 128, 128);
  if (situacion === "operativo") return;
  const color =
    situacion === "reportado"
      ? urgente
        ? "#dc2626"
        : "#f59e0b"
      : situacion === "listo"
        ? "#10b981"
        : situacion === "en_ruta"
          ? "#0ea5e9"
          : "#741dfe";
  g.beginPath();
  g.arc(64, 64, 50, 0, Math.PI * 2);
  g.fillStyle = "#ffffff";
  g.fill();
  g.lineWidth = 12;
  if (situacion === "en_taller") {
    // Aro de avance de las tareas.
    g.strokeStyle = "#e9d5ff";
    g.stroke();
    g.beginPath();
    g.arc(64, 64, 50, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.02, Math.min(1, progreso)));
    g.strokeStyle = color;
    g.lineCap = "round";
    g.stroke();
    g.fillStyle = color;
    g.font = "700 38px system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(`${Math.round(progreso * 100)}%`, 64, 67);
    return;
  }
  g.strokeStyle = color;
  g.stroke();
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineCap = "round";
  g.lineJoin = "round";
  if (situacion === "en_ruta") {
    // Flecha: va en camino.
    g.lineWidth = 12;
    g.beginPath();
    g.moveTo(36, 64);
    g.lineTo(90, 64);
    g.moveTo(70, 44);
    g.lineTo(92, 64);
    g.lineTo(70, 84);
    g.stroke();
  } else if (situacion === "reportado") {
    g.font = "800 74px system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("!", 64, 68);
  } else {
    g.lineWidth = 13;
    g.beginPath();
    g.moveTo(41, 66);
    g.lineTo(58, 82);
    g.lineTo(88, 48);
    g.stroke();
  }
}

/** Rótulo de zona pintado en el piso. */
function texturaZona(texto: string, color: string): THREE.CanvasTexture {
  const { c, g } = lienzo(512, 96);
  g.fillStyle = color;
  g.font = "800 58px system-ui, sans-serif";
  g.textAlign = "left";
  g.textBaseline = "middle";
  g.fillText(texto.toUpperCase(), 8, 50);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Franjas amarillas y negras del elevador. */
function texturaFranjas(): THREE.CanvasTexture {
  const { c, g } = lienzo(64, 64);
  g.fillStyle = "#facc15";
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = "#1e293b";
  for (let i = -64; i < 128; i += 32) {
    g.beginPath();
    g.moveTo(i, 64);
    g.lineTo(i + 16, 64);
    g.lineTo(i + 80, 0);
    g.lineTo(i + 64, 0);
    g.closePath();
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 4);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ── Modelos ────────────────────────────────────────────────────────────────
const mat = (color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0.05, ...extra });

function caja(w: number, h: number, d: number, material: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function rueda(radio: number, ancho: number, x: number, y: number, z: number, lista: THREE.Object3D[]) {
  const g = new THREE.Group();
  const caucho = new THREE.Mesh(new THREE.CylinderGeometry(radio, radio, ancho, 20), mat(0x1e293b, { roughness: 0.9 }));
  caucho.rotation.z = Math.PI / 2;
  caucho.castShadow = true;
  const rin = new THREE.Mesh(new THREE.CylinderGeometry(radio * 0.5, radio * 0.5, ancho + 0.04, 6), mat(0xcbd5e1, { metalness: 0.5 }));
  rin.rotation.z = Math.PI / 2;
  g.add(caucho, rin);
  g.position.set(x, y, z);
  lista.push(g);
  return g;
}

/** Camión de reparto: cabina de color, cava blanca. Mira hacia +z. */
type Modelo = { grupo: THREE.Group; ruedas: THREE.Object3D[]; alto: number; horquillas?: THREE.Group };

function modeloCamion(color: number): Modelo {
  const grupo = new THREE.Group();
  const ruedas: THREE.Object3D[] = [];
  const carroceria = mat(color);
  const oscuro = mat(0x334155);
  grupo.add(caja(2.1, 0.32, 6.3, oscuro, 0, 0.78, 0));
  // Cava
  grupo.add(caja(2.5, 2.6, 4.1, mat(0xf8fafc), 0, 2.25, -1.05));
  grupo.add(caja(2.52, 0.34, 4.12, carroceria, 0, 1.5, -1.05));
  grupo.add(caja(2.3, 2.3, 0.06, mat(0xe2e8f0), 0, 2.25, -3.13));
  // Cabina
  grupo.add(caja(2.3, 1.75, 1.8, carroceria, 0, 1.8, 2.15));
  grupo.add(caja(2.0, 0.8, 0.08, mat(0x1e3a5f, { roughness: 0.15, metalness: 0.4 }), 0, 2.15, 3.06));
  grupo.add(caja(0.06, 0.6, 0.9, mat(0x1e3a5f, { roughness: 0.15, metalness: 0.4 }), 1.16, 2.2, 2.3));
  grupo.add(caja(0.06, 0.6, 0.9, mat(0x1e3a5f, { roughness: 0.15, metalness: 0.4 }), -1.16, 2.2, 2.3));
  grupo.add(caja(2.36, 0.3, 0.2, oscuro, 0, 0.92, 3.08));
  const faro = mat(0xfff7d6, { emissive: 0xffe9a3, emissiveIntensity: 0.9 });
  grupo.add(caja(0.42, 0.22, 0.06, faro, 0.82, 1.22, 3.08));
  grupo.add(caja(0.42, 0.22, 0.06, faro, -0.82, 1.22, 3.08));
  const stop = mat(0xef4444, { emissive: 0xb91c1c, emissiveIntensity: 0.6 });
  grupo.add(caja(0.3, 0.2, 0.06, stop, 0.95, 1.0, -3.16));
  grupo.add(caja(0.3, 0.2, 0.06, stop, -0.95, 1.0, -3.16));
  for (const z of [2.1, -1.0, -2.3]) {
    grupo.add(rueda(0.58, 0.46, 1.1, 0.58, z, ruedas));
    grupo.add(rueda(0.58, 0.46, -1.1, 0.58, z, ruedas));
  }
  return { grupo, ruedas, alto: 3.6 };
}

/** Montacargas: contrapeso atrás, mástil y horquillas al frente (+z). */
function modeloMontacargas(color: number): Modelo {
  const grupo = new THREE.Group();
  const ruedas: THREE.Object3D[] = [];
  const cuerpo = mat(color);
  const oscuro = mat(0x1f2937);
  grupo.add(caja(1.5, 0.75, 2.2, cuerpo, 0, 0.85, -0.2));
  grupo.add(caja(1.5, 0.95, 0.75, oscuro, 0, 1.0, -1.25));
  grupo.add(caja(0.7, 0.14, 0.7, oscuro, 0, 1.32, -0.45));
  grupo.add(caja(0.7, 0.6, 0.14, oscuro, 0, 1.62, -0.8));
  grupo.add(caja(0.08, 0.5, 0.08, oscuro, 0, 1.45, 0.35));
  // Techo de protección
  for (const [x, z] of [[0.68, 0.7], [-0.68, 0.7], [0.68, -0.95], [-0.68, -0.95]] as const) {
    grupo.add(caja(0.09, 1.55, 0.09, oscuro, x, 2.0, z));
  }
  grupo.add(caja(1.5, 0.08, 1.8, oscuro, 0, 2.8, -0.12));
  // Mástil
  const acero = mat(0x64748b, { metalness: 0.6, roughness: 0.35 });
  grupo.add(caja(0.14, 3.0, 0.16, acero, 0.5, 1.75, 1.05));
  grupo.add(caja(0.14, 3.0, 0.16, acero, -0.5, 1.75, 1.05));
  grupo.add(caja(1.14, 0.12, 0.16, acero, 0, 3.2, 1.05));
  const horquillas = new THREE.Group();
  horquillas.add(caja(1.2, 0.5, 0.1, oscuro, 0, 0.25, 1.2));
  horquillas.add(caja(0.16, 0.08, 1.35, acero, 0.38, 0.04, 1.85));
  horquillas.add(caja(0.16, 0.08, 1.35, acero, -0.38, 0.04, 1.85));
  horquillas.position.y = 0.3;
  grupo.add(horquillas);
  const baliza = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), mat(0xfb923c, { emissive: 0xf97316, emissiveIntensity: 1 }));
  baliza.position.set(0, 2.94, -0.7);
  grupo.add(baliza);
  for (const z of [0.6, -0.95]) {
    grupo.add(rueda(z > 0 ? 0.42 : 0.34, 0.34, 0.78, z > 0 ? 0.42 : 0.34, z, ruedas));
    grupo.add(rueda(z > 0 ? 0.42 : 0.34, 0.34, -0.78, z > 0 ? 0.42 : 0.34, z, ruedas));
  }
  return { grupo, ruedas, alto: 3.5, horquillas };
}

type Actor = {
  dato: VehiculoEscena;
  raiz: THREE.Group;
  cuerpo: THREE.Group;
  ruedas: THREE.Object3D[];
  horquillas?: THREE.Group;
  insignia: THREE.Sprite;
  /** Aro ámbar en el piso: operativo con el servicio vencido o por vencer. */
  aroAviso: THREE.Mesh;
  lienzoInsignia: { c: HTMLCanvasElement; g: CanvasRenderingContext2D };
  alto: number;
  destino: THREE.Vector3;
  /** Altura a la que queda (sobre el elevador en el taller). */
  alturaDestino: number;
  /** Elevador que ocupa, si está en el taller. */
  bahia: number | null;
  /** Dónde estaba la última vez, y lo que muestra su insignia. */
  situacion: SituacionEscena;
  pintado: string;
  fase: number;
};

type Confeti = { puntos: THREE.Points; velocidades: Float32Array; vida: number };

export function crearEscena(contenedor: HTMLElement, opciones: OpcionesEscena): Escena {
  const calmo = opciones.movimientoReducido === true;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const lona = renderer.domElement;
  lona.style.display = "block";
  lona.style.width = "100%";
  lona.style.height = "100%";
  lona.style.outline = "none";
  contenedor.appendChild(lona);

  const escena = new THREE.Scene();
  escena.fog = new THREE.Fog(0xf1f5f9, 60, 135);

  const camara = new THREE.PerspectiveCamera(32, 2, 1, 300);
  const controles = new OrbitControls(camara, lona);
  controles.enablePan = false;
  // Sin zoom con la rueda: se llevaría el scroll de la página.
  controles.enableZoom = false;
  controles.enableDamping = true;
  controles.dampingFactor = 0.08;
  controles.rotateSpeed = 0.5;
  controles.minPolarAngle = 0.55;
  controles.maxPolarAngle = 1.25;
  controles.minAzimuthAngle = -0.9;
  controles.maxAzimuthAngle = 0.9;
  controles.target.set(0, 1.5, -3);
  // En teléfono, deslizar hacia arriba o abajo mueve la página, no la cámara.
  lona.style.touchAction = "pan-y";

  // Luces
  escena.add(new THREE.HemisphereLight(0xffffff, 0xe2e8f0, 1.9));
  const sol = new THREE.DirectionalLight(0xffffff, 1.5);
  sol.position.set(-18, 34, 22);
  sol.castShadow = true;
  sol.shadow.mapSize.set(2048, 2048);
  sol.shadow.camera.left = -48;
  sol.shadow.camera.right = 48;
  sol.shadow.camera.top = 36;
  sol.shadow.camera.bottom = -36;
  sol.shadow.camera.near = 1;
  sol.shadow.camera.far = 120;
  sol.shadow.bias = -0.0004;
  escena.add(sol);

  // Piso
  const piso = new THREE.Mesh(new THREE.PlaneGeometry(400, 300), mat(0xf1f5f9, { roughness: 1 }));
  piso.rotation.x = -Math.PI / 2;
  piso.receiveShadow = true;
  escena.add(piso);
  const losa = new THREE.Mesh(new THREE.PlaneGeometry(72, 24), mat(0xe2e8f0, { roughness: 0.95 }));
  losa.rotation.x = -Math.PI / 2;
  losa.position.set(0, 0.01, -2);
  losa.receiveShadow = true;
  escena.add(losa);

  // Zonas pintadas en el piso
  const desechables: Array<{ dispose: () => void }> = [];
  const zonaPintada = (situacion: SituacionEscena, texto: string) => {
    const z = ZONAS[situacion];
    const paso = situacion === "en_taller" ? PASO_TALLER : PASO_X;
    const ancho = (z.columnas - 1) * paso + 4.2;
    const centro = z.x0 + ((z.columnas - 1) * paso) / 2;
    const color = new THREE.Color(ZONA[situacion]);
    const fondo = new THREE.Mesh(
      new THREE.PlaneGeometry(ancho, 9.2),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.1 }),
    );
    fondo.rotation.x = -Math.PI / 2;
    fondo.position.set(centro, 0.02, Z_FILA);
    escena.add(fondo);
    const borde = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(ancho, 9.2)),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55 }),
    );
    borde.rotation.x = -Math.PI / 2;
    borde.position.set(centro, 0.03, Z_FILA);
    escena.add(borde);
    const textura = texturaZona(texto, `#${color.getHexString()}`);
    desechables.push(textura);
    const anchoRotulo = Math.min(ancho, 11);
    const rotulo = new THREE.Mesh(
      new THREE.PlaneGeometry(anchoRotulo, anchoRotulo * (96 / 512)),
      new THREE.MeshBasicMaterial({ map: textura, transparent: true, depthWrite: false }),
    );
    rotulo.rotation.x = -Math.PI / 2;
    rotulo.position.set(centro - ancho / 2 + anchoRotulo / 2, 0.04, Z_FILA + 5.7);
    escena.add(rotulo);
  };
  zonaPintada("operativo", opciones.textos.patio);
  zonaPintada("reportado", opciones.textos.reportado);
  zonaPintada("en_taller", opciones.textos.taller);
  zonaPintada("listo", opciones.textos.listo);

  // La calle: asfalto, línea central discontinua y su rótulo.
  const calle = new THREE.Mesh(new THREE.PlaneGeometry(BORDE_RUTA * 2, 4.8), mat(0x64748b, { roughness: 0.95 }));
  calle.rotation.x = -Math.PI / 2;
  calle.position.set(0, 0.02, Z_RUTA);
  calle.receiveShadow = true;
  escena.add(calle);
  for (let x = -BORDE_RUTA + 2; x < BORDE_RUTA; x += 4) {
    const raya = new THREE.Mesh(new THREE.PlaneGeometry(2, 0.18), new THREE.MeshBasicMaterial({ color: 0xf8fafc }));
    raya.rotation.x = -Math.PI / 2;
    raya.position.set(x, 0.03, Z_RUTA);
    escena.add(raya);
  }
  const texturaRuta = texturaZona(opciones.textos.ruta, "#0ea5e9");
  desechables.push(texturaRuta);
  const rotuloRuta = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 9 * (96 / 512)),
    new THREE.MeshBasicMaterial({ map: texturaRuta, transparent: true, depthWrite: false }),
  );
  rotuloRuta.rotation.x = -Math.PI / 2;
  rotuloRuta.position.set(-BORDE_RUTA + 5.4, 0.04, Z_RUTA + 3.5);
  escena.add(rotuloRuta);

  // Taller: pared del fondo, elevadores y algo de utilería
  const taller = ZONAS.en_taller;
  const centroTaller = taller.x0 + ((taller.columnas - 1) * PASO_TALLER) / 2;
  escena.add(caja(taller.columnas * PASO_TALLER + 1.5, 6.5, 0.5, mat(0xf1f5f9), centroTaller, 3.25, Z_FILA - 5.6));
  escena.add(caja(taller.columnas * PASO_TALLER + 1.5, 0.7, 0.56, mat(VIOLETA), centroTaller, 6.2, Z_FILA - 5.6));
  escena.add(caja(1.6, 1.5, 0.8, mat(0xdc2626), taller.x0 - 2.2, 0.75, Z_FILA - 4.6));
  escena.add(caja(1.6, 0.1, 0.84, mat(0x1e293b), taller.x0 - 2.2, 1.55, Z_FILA - 4.6));
  for (let i = 0; i < 3; i++) {
    const caucho = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.22, 8, 18), mat(0x1e293b, { roughness: 0.9 }));
    caucho.rotation.x = Math.PI / 2;
    caucho.position.set(centroTaller + (taller.columnas * PASO_TALLER) / 2 + 0.4, 0.22 + i * 0.44, Z_FILA - 4.4);
    caucho.castShadow = true;
    escena.add(caucho);
  }
  const franjas = texturaFranjas();
  desechables.push(franjas);
  const elevadores: Array<{ plataforma: THREE.Mesh; baliza: THREE.Mesh; ocupado: boolean }> = [];
  const elevador = (indice: number) => {
    while (elevadores.length <= indice) {
      const p = puesto("en_taller", elevadores.length);
      const plataforma = caja(3.3, 0.22, 7.6, new THREE.MeshStandardMaterial({ map: franjas, roughness: 0.7 }), p.x, 0.11, p.z);
      escena.add(plataforma);
      escena.add(caja(0.3, ALTURA_ELEVADOR + 0.9, 0.3, mat(0x475569, { metalness: 0.5 }), p.x - 1.95, (ALTURA_ELEVADOR + 0.9) / 2, p.z));
      escena.add(caja(0.3, ALTURA_ELEVADOR + 0.9, 0.3, mat(0x475569, { metalness: 0.5 }), p.x + 1.95, (ALTURA_ELEVADOR + 0.9) / 2, p.z));
      const baliza = new THREE.Mesh(
        new THREE.SphereGeometry(0.2, 14, 10),
        new THREE.MeshStandardMaterial({ color: 0xfb923c, emissive: 0xf97316, emissiveIntensity: 0 }),
      );
      baliza.position.set(p.x + 1.95, ALTURA_ELEVADOR + 2.05, p.z);
      escena.add(baliza);
      elevadores.push({ plataforma, baliza, ocupado: false });
    }
    return elevadores[indice];
  };
  for (let i = 0; i < taller.columnas; i++) elevador(i);

  // Aro del vehículo elegido
  const aro = new THREE.Mesh(
    new THREE.RingGeometry(2.5, 2.95, 48),
    new THREE.MeshBasicMaterial({ color: VIOLETA, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
  );
  aro.rotation.x = -Math.PI / 2;
  aro.visible = false;
  escena.add(aro);

  const actores = new Map<number, Actor>();
  const confetis: Confeti[] = [];
  let seleccion: number | null = null;
  let encima: number | null = null;

  const crearActor = (dato: VehiculoEscena): Actor => {
    const paleta = dato.tipo === "camion" ? COLORES_CAMION : COLORES_MONTACARGAS;
    const color = paleta[dato.id % paleta.length];
    const modelo = dato.tipo === "camion" ? modeloCamion(color) : modeloMontacargas(color);
    const raiz = new THREE.Group();
    const cuerpo = modelo.grupo;
    raiz.add(cuerpo);
    cuerpo.traverse((o) => {
      o.userData.vehiculo = dato.id;
    });

    const placa = new THREE.Sprite(new THREE.SpriteMaterial({ map: texturaPlaca(dato.codigo), depthTest: false, transparent: true }));
    placa.scale.set(3.2, 1.2, 1);
    placa.position.set(0, modelo.alto + 0.9, 0);
    placa.renderOrder = 5;
    raiz.add(placa);

    const lienzoInsignia = lienzo(128, 128);
    const insignia = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(lienzoInsignia.c), depthTest: false, transparent: true }),
    );
    (insignia.material.map as THREE.Texture).colorSpace = THREE.SRGBColorSpace;
    insignia.scale.set(2.3, 2.3, 1);
    insignia.position.set(0, modelo.alto + 2.75, 0);
    insignia.renderOrder = 6;
    raiz.add(insignia);

    const aroAviso = new THREE.Mesh(
      new THREE.RingGeometry(dato.tipo === "camion" ? 3.9 : 2.5, dato.tipo === "camion" ? 4.15 : 2.72, 40),
      new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }),
    );
    aroAviso.rotation.x = -Math.PI / 2;
    aroAviso.position.y = 0.05;
    aroAviso.visible = false;
    raiz.add(aroAviso);

    escena.add(raiz);
    return {
      dato,
      raiz,
      cuerpo,
      aroAviso,
      ruedas: modelo.ruedas,
      horquillas: modelo.horquillas,
      insignia,
      lienzoInsignia,
      alto: modelo.alto,
      destino: new THREE.Vector3(),
      alturaDestino: 0,
      bahia: null,
      situacion: dato.situacion,
      pintado: "",
      fase: Math.random() * Math.PI * 2,
    };
  };

  const pintarInsignia = (a: Actor) => {
    dibujarInsignia(a.lienzoInsignia.g, a.dato.situacion, a.dato.urgente === true, a.dato.progreso || 0);
    (a.insignia.material.map as THREE.Texture).needsUpdate = true;
    a.insignia.visible = a.dato.situacion !== "operativo";
  };

  const quitarActor = (a: Actor) => {
    escena.remove(a.raiz);
    a.raiz.traverse((o) => {
      const m = o as THREE.Mesh | THREE.Sprite;
      if ((m as THREE.Mesh).geometry) (m as THREE.Mesh).geometry.dispose();
      const material = (m as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      for (const x of Array.isArray(material) ? material : material ? [material] : []) {
        const mapa = (x as THREE.SpriteMaterial).map;
        if (mapa) mapa.dispose();
        x.dispose();
      }
    });
  };

  const estallar = (origen: THREE.Vector3) => {
    if (calmo) return;
    const n = 70;
    const posiciones = new Float32Array(n * 3);
    const colores = new Float32Array(n * 3);
    const velocidades = new Float32Array(n * 3);
    const paleta = [0x10b981, VIOLETA, 0xf59e0b, 0x38bdf8, 0xf43f5e].map((c) => new THREE.Color(c));
    for (let i = 0; i < n; i++) {
      posiciones.set([origen.x, origen.y + 3, origen.z], i * 3);
      const angulo = Math.random() * Math.PI * 2;
      const fuerza = 3 + Math.random() * 5;
      velocidades.set([Math.cos(angulo) * fuerza, 6 + Math.random() * 7, Math.sin(angulo) * fuerza], i * 3);
      const c = paleta[i % paleta.length];
      colores.set([c.r, c.g, c.b], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(posiciones, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colores, 3));
    const puntos = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ size: 0.45, vertexColors: true, transparent: true, depthWrite: false }),
    );
    escena.add(puntos);
    confetis.push({ puntos, velocidades, vida: 1.6 });
  };

  let primeraVez = true;
  const actualizar: Escena["actualizar"] = (vehiculos, elegido) => {
    seleccion = elegido;
    const vistos = new Set<number>();
    const cuenta: Record<SituacionEscena, number> = { operativo: 0, en_ruta: 0, reportado: 0, en_taller: 0, listo: 0 };
    for (const e of elevadores) e.ocupado = false;

    // Los que ya están en el taller conservan su elevador; los nuevos toman el primero libre.
    const enTaller = vehiculos.filter((v) => v.situacion === "en_taller");
    const usados = new Set<number>();
    for (const v of enTaller) {
      const a = actores.get(v.id);
      if (a && a.situacion === "en_taller" && a.bahia !== null && !usados.has(a.bahia)) usados.add(a.bahia);
      else if (a) a.bahia = null;
    }

    for (const v of vehiculos) {
      vistos.add(v.id);
      let a = actores.get(v.id);
      const nuevo = !a;
      if (!a) {
        a = crearActor(v);
        actores.set(v.id, a);
      }
      const antes = a.situacion;
      const clave = `${v.situacion}|${v.urgente === true}|${Math.round((v.progreso || 0) * 100)}`;
      a.dato = v;
      a.situacion = v.situacion;
      a.aroAviso.visible = v.situacion === "operativo" && v.aviso === true;

      let indice: number;
      if (v.situacion === "en_taller") {
        if (a.bahia === null) {
          let libre = 0;
          while (usados.has(libre)) libre++;
          a.bahia = libre;
          usados.add(libre);
        }
        indice = a.bahia;
        elevador(indice).ocupado = true;
      } else {
        a.bahia = null;
        indice = cuenta[v.situacion]++;
      }
      const p = puesto(v.situacion, indice);
      // El que ya va por la calle sigue desde donde está; el que sale a ruta
      // baja a la calle a la altura de donde estaba.
      if (v.situacion === "en_ruta" && !nuevo && !primeraVez && !calmo) {
        p.x = THREE.MathUtils.clamp(a.raiz.position.x, -BORDE_RUTA + 4, BORDE_RUTA - 4);
      }
      a.destino.set(p.x, 0, p.z);
      a.alturaDestino = v.situacion === "en_taller" ? ALTURA_ELEVADOR : 0;

      if (nuevo || primeraVez || calmo) {
        a.raiz.position.set(p.x, a.alturaDestino, p.z);
        a.raiz.rotation.y = 0;
      } else if (antes === "listo" && v.situacion === "operativo") {
        estallar(a.raiz.position);
      }
      if (a.pintado !== clave) {
        a.pintado = clave;
        pintarInsignia(a);
      }
    }
    for (const [id, a] of actores) {
      if (!vistos.has(id)) {
        quitarActor(a);
        actores.delete(id);
      }
    }
    primeraVez = false;
  };

  // ── Toques ───────────────────────────────────────────────────────────────
  const rayo = new THREE.Raycaster();
  const puntero = new THREE.Vector2();
  const vehiculoEn = (ev: PointerEvent): number | null => {
    const r = lona.getBoundingClientRect();
    puntero.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    rayo.setFromCamera(puntero, camara);
    const cuerpos = [...actores.values()].map((a) => a.cuerpo);
    const [toque] = rayo.intersectObjects(cuerpos, true);
    return toque ? (toque.object.userData.vehiculo as number) ?? null : null;
  };
  let abajo: { x: number; y: number } | null = null;
  const alBajar = (ev: PointerEvent) => {
    abajo = { x: ev.clientX, y: ev.clientY };
  };
  const alSubir = (ev: PointerEvent) => {
    // Arrastrar gira la cámara: solo cuenta como toque si casi no se movió.
    const quieto = abajo && Math.hypot(ev.clientX - abajo.x, ev.clientY - abajo.y) < 6;
    abajo = null;
    if (!quieto) return;
    const id = vehiculoEn(ev);
    if (id !== null) opciones.onSeleccion(id);
  };
  const alMover = (ev: PointerEvent) => {
    if (ev.pointerType === "touch") return;
    encima = vehiculoEn(ev);
    lona.style.cursor = encima !== null ? "pointer" : "grab";
  };
  const alSalir = () => {
    encima = null;
  };
  lona.addEventListener("pointerdown", alBajar);
  lona.addEventListener("pointerup", alSubir);
  lona.addEventListener("pointermove", alMover);
  lona.addEventListener("pointerleave", alSalir);

  // ── Tamaño ───────────────────────────────────────────────────────────────
  const ajustar = () => {
    const w = Math.max(1, contenedor.clientWidth);
    const h = Math.max(1, contenedor.clientHeight);
    renderer.setSize(w, h, false);
    camara.aspect = w / h;
    // Angosto (teléfono): la cámara se aleja, pero no tanto como para que los
    // vehículos queden diminutos; ahí sigue de cerca al elegido (ver el bucle).
    const lejos = 47 * THREE.MathUtils.clamp(2.9 / camara.aspect, 1, 1.75);
    const direccion = camara.position.clone().sub(controles.target);
    if (direccion.lengthSq() < 0.01) direccion.set(0, 0.55, 0.83);
    camara.position.copy(controles.target).add(direccion.normalize().multiplyScalar(lejos));
    camara.updateProjectionMatrix();
  };
  camara.position.set(0, 27.5, 38.5);
  ajustar();
  const observador = new ResizeObserver(ajustar);
  observador.observe(contenedor);

  // ── Bucle ────────────────────────────────────────────────────────────────
  let visible = true;
  const enPantalla = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
  });
  enPantalla.observe(contenedor);

  const reloj = new THREE.Clock();
  const v3 = new THREE.Vector3();
  let cuadro = 0;
  let destruida = false;
  const VELOCIDAD = 15;

  const animar = () => {
    if (destruida) return;
    cuadro = requestAnimationFrame(animar);
    const dt = Math.min(reloj.getDelta(), 0.05);
    if (!visible || document.hidden) return;
    const t = reloj.elapsedTime;

    for (const a of actores.values()) {
      const pos = a.raiz.position;
      v3.set(a.destino.x - pos.x, 0, a.destino.z - pos.z);
      const falta = v3.length();
      let rumbo = 0;
      if (a.situacion === "en_ruta" && !calmo && falta <= 0.05) {
        // Ya está en la calle: va pasando, y al salir por un lado entra por el otro.
        const avance = VELOCIDAD_RUTA * dt;
        pos.x += avance;
        if (pos.x > BORDE_RUTA) pos.x = -BORDE_RUTA;
        a.destino.x = pos.x;
        rumbo = Math.PI / 2;
        for (const r of a.ruedas) r.rotation.x += avance / 0.55;
      } else if (falta > 0.05) {
        // Primero baja del elevador, después maneja.
        if (pos.y > 0.02) {
          pos.y = Math.max(0, pos.y - dt * 2.4);
        } else {
          const avance = Math.min(falta, VELOCIDAD * dt * Math.min(1, 0.25 + falta / 6));
          v3.normalize();
          pos.x += v3.x * avance;
          pos.z += v3.z * avance;
          rumbo = Math.atan2(v3.x, v3.z);
          for (const r of a.ruedas) r.rotation.x += (avance / 0.55) * (Math.abs(rumbo) > Math.PI / 2 ? -1 : 1);
        }
      } else {
        pos.x = a.destino.x;
        pos.z = a.destino.z;
        pos.y += (a.alturaDestino - pos.y) * Math.min(1, dt * 2.2);
      }
      // Gira hacia donde va; al llegar, vuelve a mirar al frente.
      let giro = rumbo - a.raiz.rotation.y;
      giro = Math.atan2(Math.sin(giro), Math.cos(giro));
      a.raiz.rotation.y += giro * Math.min(1, dt * 6);

      const elegido = a.dato.id === seleccion;
      const escala = elegido ? 1.06 : a.dato.id === encima ? 1.03 : 1;
      a.cuerpo.scale.lerp(v3.set(escala, escala, escala), Math.min(1, dt * 10));

      if (a.insignia.visible) {
        a.insignia.position.y = a.alto + 2.75 + (calmo ? 0 : Math.sin(t * 3 + a.fase) * 0.22);
      }
      if (a.horquillas) {
        const arriba = a.dato.situacion === "en_taller" && !calmo ? 0.9 + Math.sin(t * 1.4 + a.fase) * 0.7 : 0.3;
        a.horquillas.position.y += (arriba - a.horquillas.position.y) * Math.min(1, dt * 3);
      }
    }

    // Elevadores: suben con su vehículo; la baliza parpadea mientras se trabaja.
    for (let i = 0; i < elevadores.length; i++) {
      const e = elevadores[i];
      const ocupante = [...actores.values()].find((a) => a.bahia === i && a.dato.situacion === "en_taller");
      const altura = ocupante ? Math.max(0.11, ocupante.raiz.position.y - 0.02) : 0.11;
      const llego = ocupante && Math.abs(ocupante.raiz.position.x - e.plataforma.position.x) < 0.2;
      e.plataforma.position.y += ((llego ? altura : 0.11) - e.plataforma.position.y) * Math.min(1, dt * 8);
      (e.baliza.material as THREE.MeshStandardMaterial).emissiveIntensity =
        e.ocupado && !calmo ? 0.6 + Math.max(0, Math.sin(t * 6 + i)) * 2.4 : e.ocupado ? 1.2 : 0;
    }

    // Aro y cámara: siguen al elegido.
    const elegido = seleccion !== null ? actores.get(seleccion) : undefined;
    aro.visible = !!elegido;
    if (elegido) {
      aro.position.set(elegido.raiz.position.x, 0.06, elegido.raiz.position.z);
      const radio = elegido.dato.tipo === "camion" ? 1.5 : 0.95;
      const pulso = calmo ? 1 : 1 + Math.sin(t * 4) * 0.05;
      aro.scale.setScalar(radio * pulso);
      (aro.material as THREE.MeshBasicMaterial).opacity = calmo ? 0.85 : 0.6 + Math.sin(t * 4) * 0.25;
    }
    const angosto = camara.aspect < 1.7;
    const foco = elegido
      ? THREE.MathUtils.clamp(elegido.raiz.position.x * (angosto ? 1 : 0.3), angosto ? -26 : -8, angosto ? 26 : 8)
      : 0;
    const corrimiento = (foco - controles.target.x) * Math.min(1, dt * 2);
    controles.target.x += corrimiento;
    camara.position.x += corrimiento;

    for (let i = confetis.length - 1; i >= 0; i--) {
      const c = confetis[i];
      c.vida -= dt;
      const p = c.puntos.geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let j = 0; j < p.count; j++) {
        c.velocidades[j * 3 + 1] -= 14 * dt;
        p.setXYZ(
          j,
          p.getX(j) + c.velocidades[j * 3] * dt,
          Math.max(0.1, p.getY(j) + c.velocidades[j * 3 + 1] * dt),
          p.getZ(j) + c.velocidades[j * 3 + 2] * dt,
        );
      }
      p.needsUpdate = true;
      (c.puntos.material as THREE.PointsMaterial).opacity = Math.max(0, c.vida / 1.6);
      if (c.vida <= 0) {
        escena.remove(c.puntos);
        c.puntos.geometry.dispose();
        (c.puntos.material as THREE.Material).dispose();
        confetis.splice(i, 1);
      }
    }

    controles.update();
    renderer.render(escena, camara);
  };
  animar();

  return {
    actualizar,
    destruir: () => {
      destruida = true;
      cancelAnimationFrame(cuadro);
      observador.disconnect();
      enPantalla.disconnect();
      lona.removeEventListener("pointerdown", alBajar);
      lona.removeEventListener("pointerup", alSubir);
      lona.removeEventListener("pointermove", alMover);
      lona.removeEventListener("pointerleave", alSalir);
      controles.dispose();
      for (const a of actores.values()) quitarActor(a);
      actores.clear();
      for (const d of desechables) d.dispose();
      escena.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const material = m.material as THREE.Material | THREE.Material[] | undefined;
        for (const x of Array.isArray(material) ? material : material ? [material] : []) x.dispose();
      });
      renderer.dispose();
      lona.remove();
    },
  };
}
