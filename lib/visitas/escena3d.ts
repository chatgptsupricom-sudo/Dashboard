import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

/**
 * La semana de visitas de un asesor en 3D: cada día es una plataforma (lunes a
 * viernes, de izquierda a derecha) con dos puestos, mañana atrás y tarde
 * adelante. Cada visita es un pin del color de su estado; las foráneas son
 * más altas y llevan un aro ámbar en el piso. Una línea une las visitas en el
 * orden en que se hacen y un punto la recorre.
 *
 * Tocar un puesto (con o sin visita) avisa a la pantalla, que abre el editor.
 * Es three.js a mano, sin React, como lib/mantenimiento/escena3d.ts.
 *
 * Solo navegador (usa WebGL y `document`): se carga con import() dinámico.
 */

export type BloqueEscena = "manana" | "tarde";
export type EstadoEscena = "planificada" | "realizada" | "no_realizada";

export type DiaEscena = {
  fecha: string;
  /** "LUN", "MAR"… */
  nombre: string;
  /** "19 oct." */
  fechaCorta: string;
  hoy: boolean;
  pasado: boolean;
};

export type VisitaEscena = {
  fecha: string;
  bloque: BloqueEscena;
  cliente: string;
  zona: string;
  foranea: boolean;
  estado: EstadoEscena;
};

export type OpcionesEscena = {
  onSeleccion: (fecha: string, bloque: BloqueEscena) => void;
  /** El puntero entró o salió de un puesto ("fecha|bloque" o null). */
  onEncima?: (clave: string | null) => void;
  /** Sin animaciones de adorno (prefers-reduced-motion). */
  movimientoReducido?: boolean;
};

export type EscenaSemana = {
  actualizar: (dias: DiaEscena[], visitas: VisitaEscena[], seleccion: string | null) => void;
  /** Resalta un puesto desde afuera (el puntero sobre la tarjeta del tablero). */
  resaltar: (clave: string | null) => void;
  destruir: () => void;
};

export const claveSlot = (fecha: string, bloque: BloqueEscena) => `${fecha}|${bloque}`;

// ── Colores ────────────────────────────────────────────────────────────────
const COLOR_ESTADO: Record<EstadoEscena, number> = {
  planificada: 0x3b82f6,
  realizada: 0x10b981,
  no_realizada: 0xef4444,
};
const AMBAR = 0xf59e0b;
const FONDO = 0x0b1630;

// ── Medidas (unidades ≈ metros) ────────────────────────────────────────────
const PASO_DIA = 7;
const ANCHO = 5.4;
const FONDO_PLAT = 9;
const ALTO = 0.6;
const Z_SLOT: Record<BloqueEscena, number> = { manana: -1.1, tarde: 2.6 };
const BLOQUES: BloqueEscena[] = ["manana", "tarde"];
const PX = 100; // px de textura por unidad

const xDia = (i: number) => (i - 2) * PASO_DIA;

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

const FUENTE = "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif";

/** Cara de arriba de una plataforma: el día, la línea entre mañana y tarde y los dos puestos. */
function texturaPlataforma(dia: DiaEscena): THREE.CanvasTexture {
  const W = ANCHO * PX;
  const H = FONDO_PLAT * PX;
  const { c, g } = lienzo(W, H);
  const zPx = (z: number) => (z + FONDO_PLAT / 2) * PX;

  const fondo = g.createLinearGradient(0, 0, 0, H);
  fondo.addColorStop(0, dia.hoy ? "#1d3b78" : dia.pasado ? "#18233a" : "#1c2a47");
  fondo.addColorStop(1, dia.hoy ? "#152c5c" : dia.pasado ? "#141d31" : "#172239");
  g.fillStyle = fondo;
  g.fillRect(0, 0, W, H);

  // Encabezado
  g.fillStyle = dia.hoy ? "rgba(96,165,250,0.22)" : "rgba(255,255,255,0.05)";
  g.fillRect(0, 0, W, 170);
  g.textBaseline = "middle";
  g.fillStyle = dia.hoy ? "#bfdbfe" : dia.pasado ? "#64748b" : "#e2e8f0";
  g.font = `900 92px ${FUENTE}`;
  g.fillText(dia.nombre, 34, 66);
  g.font = `600 40px ${FUENTE}`;
  g.fillStyle = dia.hoy ? "#93c5fd" : "#94a3b8";
  g.fillText(dia.fechaCorta, 36, 134);
  if (dia.hoy) {
    g.font = `800 34px ${FUENTE}`;
    const t = "HOY";
    const w = g.measureText(t).width + 44;
    rectRedondo(g, W - w - 30, 42, w, 56, 28);
    g.fillStyle = "#3b82f6";
    g.fill();
    g.fillStyle = "#ffffff";
    g.fillText(t, W - w - 8, 71);
  }

  // Divisoria mañana / tarde
  g.setLineDash([16, 14]);
  g.strokeStyle = "rgba(148,163,184,0.35)";
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(30, zPx(0.75));
  g.lineTo(W - 30, zPx(0.75));
  g.stroke();

  for (const b of BLOQUES) {
    const cy = zPx(Z_SLOT[b]);
    g.setLineDash([12, 12]);
    g.strokeStyle = "rgba(148,163,184,0.45)";
    g.lineWidth = 5;
    g.beginPath();
    g.arc(W / 2, cy, 105, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    g.font = `700 26px ${FUENTE}`;
    g.fillStyle = "rgba(148,163,184,0.75)";
    g.textAlign = "center";
    g.fillText(b === "manana" ? "MAÑANA" : "TARDE", W / 2, cy + 150);
    g.font = `300 70px ${FUENTE}`;
    g.fillStyle = "rgba(148,163,184,0.35)";
    g.fillText("+", W / 2, cy + 4);
    g.textAlign = "left";
  }

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Rótulo que sale arriba del pin al pasar el puntero o al elegirlo. */
function texturaRotulo(v: VisitaEscena): { textura: THREE.CanvasTexture; aspecto: number } {
  const W = 640;
  const H = 180;
  const { c, g } = lienzo(W, H);
  rectRedondo(g, 6, 6, W - 12, H - 12, 34);
  g.fillStyle = "rgba(255,255,255,0.97)";
  g.fill();
  g.fillStyle = `#${COLOR_ESTADO[v.estado].toString(16).padStart(6, "0")}`;
  rectRedondo(g, 6, 6, 18, H - 12, 9);
  g.fill();
  const recorta = (texto: string, max: number) => {
    if (g.measureText(texto).width <= max) return texto;
    let s = texto;
    while (s.length > 1 && g.measureText(`${s}…`).width > max) s = s.slice(0, -1);
    return `${s}…`;
  };
  g.textBaseline = "middle";
  g.fillStyle = "#0f172a";
  g.font = `800 52px ${FUENTE}`;
  g.fillText(recorta(v.cliente, W - 90), 52, 68);
  g.font = `500 34px ${FUENTE}`;
  g.fillStyle = "#64748b";
  const estado = v.estado === "realizada" ? "Realizada" : v.estado === "no_realizada" ? "No realizada" : "Planificada";
  const linea = [v.zona.trim(), v.foranea ? "Foránea" : "Local", estado].filter(Boolean).join(" · ");
  g.fillText(recorta(linea, W - 90), 52, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return { textura: t, aspecto: W / H };
}

function texturaBrillo(): THREE.CanvasTexture {
  const { c, g } = lienzo(128, 128);
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.25, "rgba(186,230,253,0.8)");
  r.addColorStop(1, "rgba(56,189,248,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

type Pin = {
  clave: string;
  firma: string;
  grupo: THREE.Group;
  cuerpo: THREE.Group;
  rotulo: THREE.Sprite;
  aro: THREE.Mesh | null;
  giro: THREE.Mesh | null;
  alto: number;
  nacio: number;
  retraso: number;
};

export function crearEscenaSemana(contenedor: HTMLElement, opciones: OpcionesEscena): EscenaSemana {
  const calmo = opciones.movimientoReducido === true;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  const lona = renderer.domElement;
  lona.style.display = "block";
  lona.style.width = "100%";
  lona.style.height = "100%";
  lona.style.outline = "none";
  contenedor.appendChild(lona);

  const escena = new THREE.Scene();
  escena.fog = new THREE.Fog(FONDO, 48, 95);

  const camara = new THREE.PerspectiveCamera(34, 2, 1, 200);
  const controles = new OrbitControls(camara, lona);
  controles.enablePan = false;
  // Sin zoom con la rueda: se llevaría el scroll de la página.
  controles.enableZoom = false;
  controles.enableDamping = true;
  controles.dampingFactor = 0.08;
  controles.rotateSpeed = 0.5;
  controles.minPolarAngle = 0.45;
  controles.maxPolarAngle = 1.2;
  controles.minAzimuthAngle = -0.85;
  controles.maxAzimuthAngle = 0.85;
  controles.target.set(0, 0.6, 0.6);
  // En teléfono, deslizar hacia arriba o abajo mueve la página, no la cámara.
  lona.style.touchAction = "pan-y";

  // Luces
  escena.add(new THREE.HemisphereLight(0xc7d2fe, 0x0f172a, 1.4));
  const sol = new THREE.DirectionalLight(0xffffff, 2.1);
  sol.position.set(-14, 26, 18);
  sol.castShadow = true;
  sol.shadow.mapSize.set(2048, 2048);
  sol.shadow.camera.left = -24;
  sol.shadow.camera.right = 24;
  sol.shadow.camera.top = 16;
  sol.shadow.camera.bottom = -16;
  sol.shadow.camera.near = 1;
  sol.shadow.camera.far = 80;
  sol.shadow.bias = -0.0005;
  escena.add(sol);
  const contraluz = new THREE.DirectionalLight(0x60a5fa, 0.9);
  contraluz.position.set(12, 10, -20);
  escena.add(contraluz);

  // Piso con cuadrícula
  const piso = new THREE.Mesh(
    new THREE.PlaneGeometry(260, 200),
    new THREE.MeshStandardMaterial({ color: FONDO, roughness: 1 }),
  );
  piso.rotation.x = -Math.PI / 2;
  piso.receiveShadow = true;
  escena.add(piso);
  const rejilla = new THREE.GridHelper(120, 60, 0x1e3a8a, 0x15244a);
  rejilla.position.y = 0.005;
  (rejilla.material as THREE.Material).transparent = true;
  (rejilla.material as THREE.Material).opacity = 0.55;
  escena.add(rejilla);

  const desechables: Array<{ dispose: () => void }> = [];
  const brillo = texturaBrillo();
  desechables.push(brillo);

  // ── Plataformas (una por día; se rehacen al cambiar de semana) ───────────
  const plataformas = new THREE.Group();
  escena.add(plataformas);
  let firmaSemana = "";
  const bordesHoy: THREE.LineSegments[] = [];
  // Día al que mira la cámara en un teléfono si no hay nada elegido.
  let xInicial = xDia(0);

  const vaciar = (g: THREE.Object3D) => {
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const material = m.material as THREE.Material | THREE.Material[] | undefined;
      for (const x of Array.isArray(material) ? material : material ? [material] : []) {
        const mapa = (x as THREE.MeshStandardMaterial).map;
        if (mapa && mapa !== brillo) mapa.dispose();
        x.dispose();
      }
    });
    g.clear();
  };

  const armarPlataformas = (dias: DiaEscena[]) => {
    vaciar(plataformas);
    bordesHoy.length = 0;
    const iHoy = dias.findIndex((d) => d.hoy);
    xInicial = xDia(iHoy >= 0 ? iHoy : 0);
    dias.forEach((dia, i) => {
      const lado = new THREE.MeshStandardMaterial({ color: dia.hoy ? 0x1e40af : 0x1e293b, roughness: 0.6, metalness: 0.2 });
      const arriba = new THREE.MeshStandardMaterial({ map: texturaPlataforma(dia), roughness: 0.75 });
      const caja = new THREE.Mesh(new THREE.BoxGeometry(ANCHO, ALTO, FONDO_PLAT), [lado, lado, arriba, lado, lado, lado]);
      caja.position.set(xDia(i), ALTO / 2, 0);
      caja.castShadow = true;
      caja.receiveShadow = true;
      plataformas.add(caja);
      if (dia.hoy) {
        const borde = new THREE.LineSegments(
          new THREE.EdgesGeometry(new THREE.BoxGeometry(ANCHO + 0.12, ALTO + 0.12, FONDO_PLAT + 0.12)),
          new THREE.LineBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.9 }),
        );
        borde.position.copy(caja.position);
        plataformas.add(borde);
        bordesHoy.push(borde);
      }
    });
  };

  // ── Puestos: zonas de toque, aro de elegido y aro de encima ──────────────
  const toques = new THREE.Group();
  escena.add(toques);
  const materialToque = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  const geoToque = new THREE.CylinderGeometry(1.5, 1.5, 3.4, 16);
  desechables.push(materialToque, geoToque);
  const posicionSlot = new Map<string, THREE.Vector3>();

  const armarToques = (dias: DiaEscena[]) => {
    toques.clear();
    posicionSlot.clear();
    dias.forEach((dia, i) => {
      for (const b of BLOQUES) {
        const clave = claveSlot(dia.fecha, b);
        const p = new THREE.Vector3(xDia(i), ALTO, Z_SLOT[b]);
        posicionSlot.set(clave, p);
        const m = new THREE.Mesh(geoToque, materialToque);
        m.position.set(p.x, p.y + 1.7, p.z);
        m.userData.clave = clave;
        toques.add(m);
      }
    });
  };

  const aroElegido = new THREE.Mesh(
    new THREE.RingGeometry(1.15, 1.38, 48),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }),
  );
  aroElegido.rotation.x = -Math.PI / 2;
  aroElegido.visible = false;
  escena.add(aroElegido);
  const aroEncima = new THREE.Mesh(
    new THREE.CircleGeometry(1.05, 40),
    new THREE.MeshBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.22, depthWrite: false }),
  );
  aroEncima.rotation.x = -Math.PI / 2;
  aroEncima.visible = false;
  escena.add(aroEncima);

  // ── Pines ────────────────────────────────────────────────────────────────
  const pines = new Map<string, Pin>();
  const reloj = new THREE.Clock();

  const crearPin = (v: VisitaEscena, firma: string, retraso: number): Pin => {
    const color = COLOR_ESTADO[v.estado];
    const alto = v.foranea ? 2.5 : 1.7;
    const grupo = new THREE.Group();
    const cuerpo = new THREE.Group();
    grupo.add(cuerpo);

    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.15, emissive: color, emissiveIntensity: 0.28 });
    const cono = new THREE.Mesh(new THREE.ConeGeometry(0.34, alto, 24), mat);
    cono.rotation.x = Math.PI;
    cono.position.y = alto / 2;
    cono.castShadow = true;
    cuerpo.add(cono);
    const cabeza = new THREE.Mesh(new THREE.SphereGeometry(0.62, 32, 20), mat);
    cabeza.position.y = alto;
    cabeza.castShadow = true;
    cuerpo.add(cabeza);
    const punto = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 20, 12),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, emissive: 0xffffff, emissiveIntensity: 0.35 }),
    );
    punto.position.set(0, alto, 0.48);
    cuerpo.add(punto);

    let giro: THREE.Mesh | null = null;
    if (v.estado !== "planificada") {
      giro = new THREE.Mesh(
        new THREE.TorusGeometry(0.95, 0.07, 10, 40),
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6, roughness: 0.3 }),
      );
      giro.position.y = alto;
      giro.rotation.x = Math.PI / 2.4;
      cuerpo.add(giro);
    }

    // Sombra suave en el piso
    const sombra = new THREE.Mesh(
      new THREE.CircleGeometry(0.75, 32),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    sombra.rotation.x = -Math.PI / 2;
    sombra.position.y = 0.02;
    grupo.add(sombra);

    let aro: THREE.Mesh | null = null;
    if (v.foranea) {
      aro = new THREE.Mesh(
        new THREE.RingGeometry(0.85, 1.02, 40),
        new THREE.MeshBasicMaterial({ color: AMBAR, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
      );
      aro.rotation.x = -Math.PI / 2;
      aro.position.y = 0.03;
      grupo.add(aro);
    }

    const { textura, aspecto } = texturaRotulo(v);
    const rotulo = new THREE.Sprite(new THREE.SpriteMaterial({ map: textura, depthTest: false, transparent: true, opacity: 0 }));
    rotulo.renderOrder = 10;
    rotulo.scale.set(1.45 * aspecto, 1.45, 1);
    rotulo.position.y = alto + 1.75;
    grupo.add(rotulo);

    const clave = claveSlot(v.fecha, v.bloque);
    const p = posicionSlot.get(clave);
    if (p) grupo.position.copy(p);
    escena.add(grupo);
    return { clave, firma, grupo, cuerpo, rotulo, aro, giro, alto, nacio: reloj.elapsedTime, retraso };
  };

  const quitarPin = (pin: Pin) => {
    escena.remove(pin.grupo);
    vaciar(pin.grupo);
  };

  // ── Ruta ─────────────────────────────────────────────────────────────────
  let ruta: THREE.Mesh | null = null;
  let curva: THREE.CatmullRomCurve3 | null = null;
  const viajero = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: brillo, color: 0xe0f2fe, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  viajero.scale.set(1.5, 1.5, 1);
  viajero.visible = false;
  escena.add(viajero);

  const armarRuta = (orden: VisitaEscena[]) => {
    if (ruta) {
      escena.remove(ruta);
      ruta.geometry.dispose();
      (ruta.material as THREE.Material).dispose();
      ruta = null;
    }
    curva = null;
    viajero.visible = false;
    const puntos = orden
      .map((v) => posicionSlot.get(claveSlot(v.fecha, v.bloque)))
      .filter((p): p is THREE.Vector3 => !!p)
      .map((p) => new THREE.Vector3(p.x, p.y + 0.22, p.z));
    if (puntos.length < 2) return;
    curva = new THREE.CatmullRomCurve3(puntos, false, "centripetal");
    ruta = new THREE.Mesh(
      new THREE.TubeGeometry(curva, puntos.length * 24, 0.09, 8, false),
      new THREE.MeshStandardMaterial({ color: 0x7dd3fc, emissive: 0x38bdf8, emissiveIntensity: 0.9, transparent: true, opacity: 0.75 }),
    );
    escena.add(ruta);
    viajero.visible = !calmo;
  };

  // ── Estado ───────────────────────────────────────────────────────────────
  let seleccion: string | null = null;
  let encima: string | null = null;
  let externo: string | null = null;

  const actualizar = (dias: DiaEscena[], visitas: VisitaEscena[], sel: string | null) => {
    const firma = dias.map((d) => `${d.fecha}:${d.hoy ? 1 : 0}:${d.pasado ? 1 : 0}`).join(",");
    if (firma !== firmaSemana) {
      firmaSemana = firma;
      armarPlataformas(dias);
      armarToques(dias);
      for (const p of pines.values()) quitarPin(p);
      pines.clear();
    }
    const fechas = dias.map((d) => d.fecha);
    const conCliente = visitas
      .filter((v) => v.cliente.trim() && fechas.includes(v.fecha))
      .sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.bloque === b.bloque ? 0 : a.bloque === "manana" ? -1 : 1));
    const vistas = new Set<string>();
    conCliente.forEach((v, i) => {
      const clave = claveSlot(v.fecha, v.bloque);
      vistas.add(clave);
      const f = `${v.cliente}|${v.zona}|${v.foranea}|${v.estado}`;
      const actual = pines.get(clave);
      if (actual?.firma === f) return;
      if (actual) quitarPin(actual);
      pines.set(clave, crearPin(v, f, actual ? 0 : i * 0.07));
    });
    for (const [clave, p] of pines) {
      if (!vistas.has(clave)) {
        quitarPin(p);
        pines.delete(clave);
      }
    }
    armarRuta(conCliente);
    seleccion = sel;
  };

  // ── Toques ───────────────────────────────────────────────────────────────
  const rayo = new THREE.Raycaster();
  const puntero = new THREE.Vector2();
  const slotEn = (ev: PointerEvent): string | null => {
    const r = lona.getBoundingClientRect();
    puntero.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    rayo.setFromCamera(puntero, camara);
    const [toque] = rayo.intersectObjects(toques.children, false);
    return toque ? ((toque.object.userData.clave as string) ?? null) : null;
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
    const clave = slotEn(ev);
    if (!clave) return;
    const [fecha, bloque] = clave.split("|");
    opciones.onSeleccion(fecha, bloque as BloqueEscena);
  };
  const alMover = (ev: PointerEvent) => {
    if (ev.pointerType === "touch") return;
    const nuevo = slotEn(ev);
    if (nuevo !== encima) {
      encima = nuevo;
      opciones.onEncima?.(nuevo);
    }
    lona.style.cursor = encima ? "pointer" : "grab";
  };
  const alSalir = () => {
    if (encima) opciones.onEncima?.(null);
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
    // A la distancia justa para que los cinco días llenen el ancho (y quepan
    // de alto con los pines). En un teléfono los cinco quedarían diminutos:
    // ahí entran unos dos días y la cámara sigue al día activo (ver el bucle).
    angosto = camara.aspect < 1.6;
    const tan = Math.tan(THREE.MathUtils.degToRad(camara.fov / 2));
    const mitadAncho = angosto ? 7.5 : 19;
    const lejos = Math.max(mitadAncho / (tan * camara.aspect), 7.5 / tan) * 1.06;
    const direccion = camara.position.clone().sub(controles.target);
    if (direccion.lengthSq() < 0.01) direccion.set(0, 0.74, 0.67);
    camara.position.copy(controles.target).add(direccion.normalize().multiplyScalar(lejos));
    camara.updateProjectionMatrix();
  };
  let angosto = false;
  camara.position.set(0, 26, 23.5);
  ajustar();
  const observador = new ResizeObserver(ajustar);
  observador.observe(contenedor);

  // ── Bucle ────────────────────────────────────────────────────────────────
  let visible = true;
  const enPantalla = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
  });
  enPantalla.observe(contenedor);

  let cuadro = 0;
  let destruida = false;
  // Rebote al caer el pin (easeOutBack).
  const caida = (x: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
  };

  const animar = () => {
    if (destruida) return;
    cuadro = requestAnimationFrame(animar);
    const dt = Math.min(reloj.getDelta(), 0.05);
    if (!visible || document.hidden) return;
    const t = reloj.elapsedTime;
    const destacado = encima ?? externo;

    for (const pin of pines.values()) {
      const edad = t - pin.nacio - pin.retraso;
      const avance = calmo ? 1 : THREE.MathUtils.clamp(edad / 0.7, 0, 1);
      const arriba = pin.clave === destacado || pin.clave === seleccion;
      const flota = calmo ? 0 : Math.sin(t * 2 + pin.grupo.position.x) * 0.08;
      const objetivo = (arriba ? 0.45 : 0) + flota;
      const base = avance < 1 ? (1 - caida(avance)) * 7 : 0;
      pin.cuerpo.position.y += ((objetivo + base) - pin.cuerpo.position.y) * (avance < 1 ? 1 : Math.min(1, dt * 10));
      pin.cuerpo.visible = edad > 0 || calmo;
      const escala = arriba ? 1.12 : 1;
      pin.cuerpo.scale.setScalar(pin.cuerpo.scale.x + (escala - pin.cuerpo.scale.x) * Math.min(1, dt * 10));
      const m = pin.rotulo.material as THREE.SpriteMaterial;
      m.opacity += ((arriba ? 1 : 0) - m.opacity) * Math.min(1, dt * 12);
      pin.rotulo.visible = m.opacity > 0.02;
      pin.rotulo.position.y = pin.alto + 1.75 + pin.cuerpo.position.y;
      if (pin.giro && !calmo) pin.giro.rotation.z += dt * 1.6;
      if (pin.aro && !calmo) {
        const s = 1 + 0.08 * Math.sin(t * 3 + pin.grupo.position.x);
        pin.aro.scale.set(s, s, 1);
      }
    }

    // Aro del elegido y del que está debajo del puntero
    const pSel = seleccion ? posicionSlot.get(seleccion) : undefined;
    aroElegido.visible = !!pSel;
    if (pSel) {
      aroElegido.position.set(pSel.x, pSel.y + 0.04, pSel.z);
      const s = calmo ? 1 : 1 + 0.06 * Math.sin(t * 4);
      aroElegido.scale.set(s, s, 1);
    }
    const pEnc = destacado && destacado !== seleccion ? posicionSlot.get(destacado) : undefined;
    aroEncima.visible = !!pEnc;
    if (pEnc) aroEncima.position.set(pEnc.x, pEnc.y + 0.03, pEnc.z);

    for (const b of bordesHoy) {
      (b.material as THREE.LineBasicMaterial).opacity = calmo ? 0.9 : 0.55 + 0.4 * Math.sin(t * 2.4);
    }

    if (curva && viajero.visible) {
      const vuelta = Math.max(3, curva.points.length * 1.4);
      curva.getPointAt((t % vuelta) / vuelta, viajero.position);
      viajero.position.y += 0.05;
    }

    // En un teléfono la cámara se desliza hasta el día activo.
    const foco = (seleccion && posicionSlot.get(seleccion)) || (destacado && posicionSlot.get(destacado));
    const xObjetivo = angosto ? (foco ? foco.x : xInicial) : 0;
    const paso = (xObjetivo - controles.target.x) * (calmo ? 1 : Math.min(1, dt * 3.5));
    if (Math.abs(paso) > 1e-4) {
      controles.target.x += paso;
      camara.position.x += paso;
    }

    controles.update();
    renderer.render(escena, camara);
  };
  animar();

  return {
    actualizar,
    resaltar: (clave) => {
      externo = clave;
    },
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
      for (const p of pines.values()) quitarPin(p);
      pines.clear();
      for (const d of desechables) d.dispose();
      escena.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const material = m.material as THREE.Material | THREE.Material[] | undefined;
        for (const x of Array.isArray(material) ? material : material ? [material] : []) {
          const mapa = (x as THREE.MeshStandardMaterial).map;
          if (mapa) mapa.dispose();
          x.dispose();
        }
      });
      renderer.dispose();
      lona.remove();
    },
  };
}
