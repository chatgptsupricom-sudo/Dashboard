import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

/**
 * La descarga de un packing list en 3D: a la izquierda los contenedores, a la
 * derecha un pallet por renglón del packing list.
 *
 *  - Cada pallet se va llenando con lo contado de su producto: verde cuando
 *    llegó completo, ámbar si falta, azul si sobra, y con una marca roja si
 *    alguna caja llegó dañada.
 *  - Cada vez que se cuenta algo, una caja sale volando del contenedor a su
 *    pallet, y el contenedor abierto se va vaciando con el avance total.
 *  - Un contenedor por llegar se ve translúcido; descargando, con las puertas
 *    abiertas; cerrado, con las puertas cerradas.
 *
 * Tocar un pallet avisa a la pantalla (`onSeleccion`), que lleva a su renglón.
 * three.js a mano, sin React, como lib/mantenimiento/escena3d. Solo navegador.
 */

export type ItemEscena = {
  id: number;
  esperada: number;
  /** null = todavía no se contó. */
  recibida: number | null;
  /** Alguna caja llegó dañada, húmeda o abierta. */
  danado: boolean;
};

export type ContenedorEscena = {
  id: number;
  numero: string;
  etapa: "por_llegar" | "descargando" | "cerrado";
};

export type DatosEscena = {
  items: ItemEscena[];
  contenedores: ContenedorEscena[];
  /** Renglón resaltado (el último contado, o el que se tocó). */
  seleccion: number | null;
};

export type OpcionesEscena = {
  onSeleccion: (itemId: number) => void;
  /** El pallet bajo el cursor, para mostrar de qué producto es. */
  onEncima?: (itemId: number | null) => void;
  /** Sin animaciones de adorno (prefers-reduced-motion). */
  movimientoReducido?: boolean;
};

export type Escena = {
  actualizar: (datos: DatosEscena) => void;
  destruir: () => void;
};

// ── Colores ────────────────────────────────────────────────────────────────
const VIOLETA = 0x741dfe;
const COLOR = {
  completo: new THREE.Color(0x34d399),
  falta: new THREE.Color(0xfbbf24),
  sobra: new THREE.Color(0x38bdf8),
  vacio: new THREE.Color(0xe2e8f0),
  pallet: new THREE.Color(0xc8a57a),
  palletVacio: new THREE.Color(0xe7ddd0),
};
const COLORES_CONTENEDOR = [0x2563eb, 0xb45309, 0x047857, 0x7c3aed, 0xbe123c, 0x0e7490];

// ── Medidas (unidades ≈ metros) ────────────────────────────────────────────
const PASO = 2.3;
const LADO = 1.6;
const ALTO_PILA = 1.9;
const X_PALLETS = -4;
const LARGO_CONT = 9;
const ANCHO_CONT = 2.6;
const ALTO_CONT = 2.8;
const PASO_CONT = 4.4;
/** La cara de las puertas, mirando a los pallets. */
const X_PUERTAS = -9.5;
const VUELOS_A_LA_VEZ = 14;

const mat = (color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05, ...extra });

function lienzo(ancho: number, alto: number) {
  const c = document.createElement("canvas");
  c.width = ancho;
  c.height = alto;
  return { c, g: c.getContext("2d")! };
}

/** Cartón: cajas apiladas con su cinta, en gris claro para teñirlo por instancia. */
function texturaCajas(): THREE.CanvasTexture {
  const { c, g } = lienzo(128, 128);
  g.fillStyle = "#f4f4f5";
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = "rgba(15,23,42,0.28)";
  g.lineWidth = 3;
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 2; x++) g.strokeRect(x * 64 + 1.5, y * 64 + 1.5, 61, 61);
  }
  g.fillStyle = "rgba(15,23,42,0.12)";
  for (let y = 0; y < 2; y++) g.fillRect(0, y * 64 + 27, 128, 9);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Chapa corrugada del contenedor. */
function texturaChapa(): THREE.CanvasTexture {
  const { c, g } = lienzo(64, 64);
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = "rgba(15,23,42,0.16)";
  for (let x = 0; x < 64; x += 8) g.fillRect(x, 0, 3, 64);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(9, 1);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Rótulo con el número del contenedor. */
function texturaRotulo(texto: string): THREE.CanvasTexture {
  const { c, g } = lienzo(384, 96);
  g.fillStyle = "#0f172a";
  g.beginPath();
  g.roundRect(4, 8, 376, 80, 20);
  g.fill();
  g.fillStyle = "#ffffff";
  g.textAlign = "center";
  g.textBaseline = "middle";
  let tam = 44;
  g.font = `700 ${tam}px ui-monospace, Menlo, Consolas, monospace`;
  while (g.measureText(texto).width > 340 && tam > 18) {
    tam -= 2;
    g.font = `700 ${tam}px ui-monospace, Menlo, Consolas, monospace`;
  }
  g.fillText(texto, 192, 50);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function caja(w: number, h: number, d: number, material: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

type Caja3D = {
  dato: ContenedorEscena;
  grupo: THREE.Group;
  /** Paredes y techo: se vuelven translúcidos mientras no llega. */
  chapa: THREE.MeshStandardMaterial;
  puertas: [THREE.Group, THREE.Group];
  carga: THREE.Mesh;
  /** Cuánto están abiertas las puertas, de 0 a 1. */
  apertura: number;
};

type Vuelo = { malla: THREE.Mesh; desde: THREE.Vector3; hasta: THREE.Vector3; t: number; activo: boolean };

export function crearEscenaRecepcion(contenedor: HTMLElement, opciones: OpcionesEscena): Escena {
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
  escena.fog = new THREE.Fog(0xf1f5f9, 70, 160);

  const camara = new THREE.PerspectiveCamera(32, 2, 1, 320);
  const controles = new OrbitControls(camara, lona);
  controles.enablePan = false;
  // Sin zoom con la rueda: se llevaría el scroll de la página.
  controles.enableZoom = false;
  controles.enableDamping = true;
  controles.dampingFactor = 0.08;
  controles.rotateSpeed = 0.5;
  controles.minPolarAngle = 0.5;
  controles.maxPolarAngle = 1.25;
  controles.minAzimuthAngle = -0.9;
  controles.maxAzimuthAngle = 0.9;
  // En teléfono, deslizar hacia arriba o abajo mueve la página, no la cámara.
  lona.style.touchAction = "pan-y";

  escena.add(new THREE.HemisphereLight(0xffffff, 0xe2e8f0, 1.9));
  const sol = new THREE.DirectionalLight(0xffffff, 1.5);
  sol.position.set(-16, 34, 24);
  sol.castShadow = true;
  sol.shadow.mapSize.set(2048, 2048);
  sol.shadow.camera.left = -50;
  sol.shadow.camera.right = 50;
  sol.shadow.camera.top = 40;
  sol.shadow.camera.bottom = -40;
  sol.shadow.camera.near = 1;
  sol.shadow.camera.far = 130;
  sol.shadow.bias = -0.0004;
  escena.add(sol);

  const piso = new THREE.Mesh(new THREE.PlaneGeometry(400, 300), mat(0xf1f5f9, { roughness: 1 }));
  piso.rotation.x = -Math.PI / 2;
  piso.receiveShadow = true;
  escena.add(piso);
  // El piso del almacén, bajo los pallets: se redimensiona con la cuadrícula.
  const losa = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat(0xe2e8f0, { roughness: 0.95 }));
  losa.rotation.x = -Math.PI / 2;
  losa.position.y = 0.01;
  losa.receiveShadow = true;
  escena.add(losa);

  const texCajas = texturaCajas();
  const texChapa = texturaChapa();
  const matCarton = new THREE.MeshStandardMaterial({ map: texCajas, roughness: 0.85 });

  // ── Pallets y pilas, instanciados: un packing list puede traer cientos ───
  const geoPallet = new THREE.BoxGeometry(LADO, 0.16, LADO);
  const geoPila = new THREE.BoxGeometry(LADO * 0.9, 1, LADO * 0.9);
  geoPila.translate(0, 0.5, 0); // crece desde la base
  const geoMarca = new THREE.ConeGeometry(0.28, 0.5, 4);
  let pallets: THREE.InstancedMesh | null = null;
  let pilas: THREE.InstancedMesh | null = null;
  let marcas: THREE.InstancedMesh | null = null;

  let items: ItemEscena[] = [];
  let indiceDe = new Map<number, number>();
  let posiciones: THREE.Vector3[] = [];
  /** Altura actual y la que le toca a cada pila (de 0 a 1,15). */
  let altura: number[] = [];
  let meta: number[] = [];
  let recibidaAntes = new Map<number, number | null>();
  let columnas = 1;
  let filas = 1;
  let xMax = X_PALLETS;

  const armarPallets = (n: number) => {
    for (const m of [pallets, pilas, marcas]) {
      if (m) {
        escena.remove(m);
        m.dispose();
      }
    }
    pallets = pilas = marcas = null;
    posiciones = [];
    altura = new Array(n).fill(0);
    meta = new Array(n).fill(0);
    if (n === 0) return;

    // Cuadrícula algo más ancha que alta: es lo que entra en una pantalla apaisada.
    columnas = THREE.MathUtils.clamp(Math.ceil(Math.sqrt(n * 1.8)), 3, 22);
    filas = Math.ceil(n / columnas);
    const z0 = -((filas - 1) * PASO) / 2;
    for (let i = 0; i < n; i++) {
      posiciones.push(new THREE.Vector3(X_PALLETS + (i % columnas) * PASO, 0, z0 + Math.floor(i / columnas) * PASO));
    }
    xMax = X_PALLETS + (columnas - 1) * PASO;

    pallets = new THREE.InstancedMesh(geoPallet, mat(0xffffff, { roughness: 0.9 }), n);
    pilas = new THREE.InstancedMesh(geoPila, matCarton, n);
    marcas = new THREE.InstancedMesh(geoMarca, mat(0xef4444, { emissive: 0x7f1d1d, emissiveIntensity: 0.5 }), n);
    for (const m of [pallets, pilas, marcas]) {
      m.castShadow = true;
      m.receiveShadow = true;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      escena.add(m);
    }
    losa.scale.set((columnas - 1) * PASO + 5, filas * PASO + 3, 1);
    losa.position.set(X_PALLETS + ((columnas - 1) * PASO) / 2, 0.01, 0);
  };

  // ── Contenedores ─────────────────────────────────────────────────────────
  const cajas = new Map<number, Caja3D>();
  const desechables: Array<{ dispose: () => void }> = [texCajas, texChapa];

  const crearContenedor = (dato: ContenedorEscena, orden: number): Caja3D => {
    const color = COLORES_CONTENEDOR[orden % COLORES_CONTENEDOR.length];
    const chapa = new THREE.MeshStandardMaterial({ color, map: texChapa, roughness: 0.6, metalness: 0.25, transparent: true });
    const grupo = new THREE.Group();
    const cx = X_PUERTAS - LARGO_CONT / 2;
    const g = 0.1;
    grupo.add(caja(LARGO_CONT, g, ANCHO_CONT, chapa, cx, 0.4, 0)); // piso
    grupo.add(caja(LARGO_CONT, g, ANCHO_CONT, chapa, cx, 0.4 + ALTO_CONT, 0)); // techo
    grupo.add(caja(LARGO_CONT, ALTO_CONT, g, chapa, cx, 0.4 + ALTO_CONT / 2, ANCHO_CONT / 2)); // lado
    grupo.add(caja(LARGO_CONT, ALTO_CONT, g, chapa, cx, 0.4 + ALTO_CONT / 2, -ANCHO_CONT / 2)); // lado
    grupo.add(caja(g, ALTO_CONT, ANCHO_CONT, chapa, X_PUERTAS - LARGO_CONT, 0.4 + ALTO_CONT / 2, 0)); // fondo
    // Patas del chasis
    for (const x of [cx - 3, cx + 3]) grupo.add(caja(0.5, 0.4, ANCHO_CONT * 0.8, mat(0x334155), x, 0.2, 0));

    // Puertas: cada hoja gira sobre su bisagra, en la esquina.
    const puerta = (lado: 1 | -1) => {
      const bisagra = new THREE.Group();
      bisagra.position.set(X_PUERTAS, 0.4 + ALTO_CONT / 2, (lado * ANCHO_CONT) / 2);
      const hoja = caja(g, ALTO_CONT - 0.1, ANCHO_CONT / 2 - 0.03, chapa, 0, 0, (-lado * ANCHO_CONT) / 4);
      bisagra.add(hoja);
      const barra = caja(0.06, ALTO_CONT - 0.5, 0.06, mat(0xcbd5e1, { metalness: 0.7, roughness: 0.3 }), 0.08, 0, (-lado * ANCHO_CONT) / 4);
      bisagra.add(barra);
      grupo.add(bisagra);
      return bisagra;
    };
    const puertas: [THREE.Group, THREE.Group] = [puerta(1), puerta(-1)];

    // La carga: un bloque de cajas que se acorta desde las puertas hacia el fondo.
    const geoCarga = new THREE.BoxGeometry(1, ALTO_CONT - 0.5, ANCHO_CONT - 0.4);
    geoCarga.translate(0.5, 0, 0); // crece desde el fondo
    const texCarga = texCajas.clone();
    texCarga.wrapS = texCarga.wrapT = THREE.RepeatWrapping;
    texCarga.repeat.set(4, 2);
    texCarga.needsUpdate = true;
    desechables.push(texCarga);
    const carga = new THREE.Mesh(geoCarga, new THREE.MeshStandardMaterial({ map: texCarga, color: 0xd6b38a, roughness: 0.9 }));
    carga.position.set(X_PUERTAS - LARGO_CONT + 0.15, 0.4 + (ALTO_CONT - 0.5) / 2 + 0.06, 0);
    carga.castShadow = true;
    grupo.add(carga);

    const textura = texturaRotulo(dato.numero || "—");
    desechables.push(textura);
    const rotulo = new THREE.Sprite(new THREE.SpriteMaterial({ map: textura, depthTest: false, transparent: true }));
    rotulo.scale.set(4.4, 1.1, 1);
    rotulo.position.set(cx, 0.4 + ALTO_CONT + 1.1, 0);
    rotulo.renderOrder = 5;
    grupo.add(rotulo);

    escena.add(grupo);
    return { dato, grupo, chapa, puertas, carga, apertura: dato.etapa === "descargando" ? 1 : 0 };
  };

  // ── Cajas en vuelo y resaltado ───────────────────────────────────────────
  const vuelos: Vuelo[] = [];
  const geoVuelo = new THREE.BoxGeometry(0.75, 0.75, 0.75);
  const matVuelo = new THREE.MeshStandardMaterial({ map: texCajas, color: 0xd6b38a, roughness: 0.85 });
  const lanzar = (hasta: THREE.Vector3) => {
    if (calmo) return;
    const abiertos = [...cajas.values()].filter((c) => c.dato.etapa === "descargando");
    if (abiertos.length === 0) return;
    let v = vuelos.find((x) => !x.activo);
    if (!v) {
      if (vuelos.length >= VUELOS_A_LA_VEZ) return;
      const malla = new THREE.Mesh(geoVuelo, matVuelo);
      malla.castShadow = true;
      malla.visible = false;
      escena.add(malla);
      v = { malla, desde: new THREE.Vector3(), hasta: new THREE.Vector3(), t: 0, activo: false };
      vuelos.push(v);
    }
    const origen = abiertos[Math.floor(Math.random() * abiertos.length)].grupo.position;
    v.desde.set(X_PUERTAS + 0.6, 1.6, origen.z);
    v.hasta.copy(hasta);
    v.t = 0;
    v.activo = true;
    v.malla.visible = true;
  };

  const aro = new THREE.Mesh(
    new THREE.RingGeometry(1.15, 1.4, 40),
    new THREE.MeshBasicMaterial({ color: VIOLETA, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }),
  );
  aro.rotation.x = -Math.PI / 2;
  aro.visible = false;
  escena.add(aro);

  let seleccion: number | null = null;
  let encima: number | null = null;
  let primeraVez = true;
  let centroX = 0;
  let anchoTotal = 40;

  const metaDe = (i: ItemEscena): number => {
    if (i.recibida === null) return 0;
    if (i.esperada <= 0) return i.recibida > 0 ? 1.15 : 0;
    return THREE.MathUtils.clamp(i.recibida / i.esperada, i.recibida > 0 ? 0.06 : 0, 1.15);
  };

  const colorDe = (i: ItemEscena): THREE.Color =>
    i.recibida === null
      ? COLOR.vacio
      : i.recibida > i.esperada
        ? COLOR.sobra
        : i.recibida < i.esperada
          ? COLOR.falta
          : COLOR.completo;

  const encuadrar = () => {
    const w = Math.max(1, contenedor.clientWidth);
    const h = Math.max(1, contenedor.clientHeight);
    renderer.setSize(w, h, false);
    camara.aspect = w / h;
    // Lo que tiene que entrar: de los contenedores al último pallet, y todas las filas.
    const izquierda = X_PUERTAS - LARGO_CONT - 1.5;
    centroX = (izquierda + xMax + 1.5) / 2;
    anchoTotal = xMax + 1.5 - izquierda;
    const fondo = Math.max(filas * PASO, cajas.size * PASO_CONT) + 4;
    const tanV = Math.tan(THREE.MathUtils.degToRad(camara.fov / 2));
    const porAncho = anchoTotal / 2 / (tanV * camara.aspect);
    const porFondo = fondo / 2 / tanV;
    const lejos = THREE.MathUtils.clamp(Math.max(porAncho, porFondo * 0.75) * 1.18, 24, 150);
    const direccion = camara.position.clone().sub(controles.target);
    if (direccion.lengthSq() < 0.01) direccion.set(0, 0.6, 0.8);
    controles.target.set(centroX, 1.2, 0);
    camara.position.copy(controles.target).add(direccion.normalize().multiplyScalar(lejos));
    camara.updateProjectionMatrix();
  };

  const actualizar: Escena["actualizar"] = (datos) => {
    seleccion = datos.seleccion;

    // Contenedores: se crean una vez; después solo cambia su etapa.
    const vistos = new Set<number>();
    datos.contenedores.forEach((c, orden) => {
      vistos.add(c.id);
      let caja3d = cajas.get(c.id);
      if (!caja3d) {
        caja3d = crearContenedor(c, orden);
        cajas.set(c.id, caja3d);
      }
      caja3d.dato = c;
      caja3d.grupo.position.z = (orden - (datos.contenedores.length - 1) / 2) * PASO_CONT;
    });
    for (const [id, c] of cajas) {
      if (!vistos.has(id)) {
        escena.remove(c.grupo);
        cajas.delete(id);
      }
    }

    // Pallets: la cuadrícula solo se rehace si cambió la lista de renglones.
    const mismos = datos.items.length === items.length && datos.items.every((x, i) => x.id === items[i].id);
    items = datos.items;
    if (!mismos) {
      armarPallets(items.length);
      indiceDe = new Map(items.map((x, i) => [x.id, i]));
      recibidaAntes = new Map();
      primeraVez = true;
    }
    items.forEach((it, i) => {
      meta[i] = metaDe(it);
      const antes = recibidaAntes.get(it.id);
      // Se contó algo más de este renglón: una caja va a su pallet.
      if (!primeraVez && it.recibida !== null && it.recibida > (antes ?? 0)) lanzar(posiciones[i]);
      recibidaAntes.set(it.id, it.recibida);
      if (primeraVez || calmo) altura[i] = meta[i];
    });
    if (pallets && pilas && marcas) {
      const m4 = new THREE.Matrix4();
      const cero = new THREE.Matrix4().makeScale(0, 0, 0);
      items.forEach((it, i) => {
        m4.makeTranslation(posiciones[i].x, 0.08, posiciones[i].z);
        pallets!.setMatrixAt(i, m4);
        pallets!.setColorAt(i, it.recibida === null ? COLOR.palletVacio : COLOR.pallet);
        pilas!.setColorAt(i, colorDe(it));
        if (it.danado) {
          m4.makeRotationX(Math.PI).setPosition(posiciones[i].x, 0.16 + Math.max(0.3, meta[i] * ALTO_PILA) + 0.55, posiciones[i].z);
          marcas!.setMatrixAt(i, m4);
        } else {
          marcas!.setMatrixAt(i, cero);
        }
      });
      pallets.instanceMatrix.needsUpdate = true;
      marcas.instanceMatrix.needsUpdate = true;
      if (pallets.instanceColor) pallets.instanceColor.needsUpdate = true;
      if (pilas.instanceColor) pilas.instanceColor.needsUpdate = true;
    }
    if (!mismos || primeraVez) encuadrar();
    primeraVez = false;
  };

  // ── Toques ───────────────────────────────────────────────────────────────
  const rayo = new THREE.Raycaster();
  const puntero = new THREE.Vector2();
  const itemEn = (ev: PointerEvent): number | null => {
    if (!pallets || !pilas) return null;
    const r = lona.getBoundingClientRect();
    puntero.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    rayo.setFromCamera(puntero, camara);
    const [toque] = rayo.intersectObjects([pallets, pilas], false);
    return toque && toque.instanceId !== undefined ? (items[toque.instanceId]?.id ?? null) : null;
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
    const id = itemEn(ev);
    if (id !== null) opciones.onSeleccion(id);
  };
  const alMover = (ev: PointerEvent) => {
    if (ev.pointerType === "touch") return;
    const id = itemEn(ev);
    if (id !== encima) {
      encima = id;
      opciones.onEncima?.(id);
    }
    lona.style.cursor = id !== null ? "pointer" : "grab";
  };
  const alSalir = () => {
    if (encima !== null) {
      encima = null;
      opciones.onEncima?.(null);
    }
  };
  lona.addEventListener("pointerdown", alBajar);
  lona.addEventListener("pointerup", alSubir);
  lona.addEventListener("pointermove", alMover);
  lona.addEventListener("pointerleave", alSalir);

  camara.position.set(0, 30, 40);
  encuadrar();
  const observador = new ResizeObserver(encuadrar);
  observador.observe(contenedor);

  let visible = true;
  const enPantalla = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
  });
  enPantalla.observe(contenedor);

  const reloj = new THREE.Clock();
  const m4 = new THREE.Matrix4();
  const escala = new THREE.Vector3();
  const base = new THREE.Vector3();
  const sinGiro = new THREE.Quaternion();
  let cuadro = 0;
  let destruida = false;

  const animar = () => {
    if (destruida) return;
    cuadro = requestAnimationFrame(animar);
    const dt = Math.min(reloj.getDelta(), 0.05);
    if (!visible || document.hidden) return;
    const t = reloj.elapsedTime;

    // Pilas: crecen hacia lo contado; el pallet bajo el cursor o elegido se agranda un poco.
    if (pilas) {
      let total = 0;
      let lleno = 0;
      for (let i = 0; i < items.length; i++) {
        altura[i] += (meta[i] - altura[i]) * Math.min(1, dt * 5);
        const id = items[i].id;
        const realce = id === seleccion ? 1.12 : id === encima ? 1.06 : 1;
        escala.set(realce, Math.max(0.0001, altura[i] * ALTO_PILA), realce);
        m4.compose(base.set(posiciones[i].x, 0.16, posiciones[i].z), sinGiro, escala);
        pilas.setMatrixAt(i, m4);
        total += Math.max(0, items[i].esperada);
        lleno += Math.min(Math.max(0, items[i].esperada), Math.max(0, items[i].recibida ?? 0));
      }
      pilas.instanceMatrix.needsUpdate = true;

      // El contenedor abierto se vacía con el avance; cerrado, quedó vacío.
      const avance = total > 0 ? lleno / total : 0;
      for (const c of cajas.values()) {
        const abierto = c.dato.etapa === "descargando";
        const quiere = abierto ? 1 : 0;
        c.apertura += (quiere - c.apertura) * Math.min(1, dt * 3);
        c.puertas[0].rotation.y = -c.apertura * 1.9;
        c.puertas[1].rotation.y = c.apertura * 1.9;
        const largo = c.dato.etapa === "cerrado" ? 0 : c.dato.etapa === "por_llegar" ? 1 : 1 - avance;
        c.carga.scale.x += (Math.max(0.0001, largo * (LARGO_CONT - 0.4)) - c.carga.scale.x) * Math.min(1, dt * 4);
        c.carga.visible = c.carga.scale.x > 0.05;
        const opaco = c.dato.etapa === "por_llegar" ? 0.28 : 1;
        c.chapa.opacity += (opaco - c.chapa.opacity) * Math.min(1, dt * 4);
        c.chapa.depthWrite = c.chapa.opacity > 0.9;
      }
    }

    for (const v of vuelos) {
      if (!v.activo) continue;
      v.t = Math.min(1, v.t + dt / 0.75);
      const e = v.t * v.t * (3 - 2 * v.t);
      v.malla.position.lerpVectors(v.desde, v.hasta, e);
      v.malla.position.y = THREE.MathUtils.lerp(v.desde.y, 0.6, e) + Math.sin(Math.PI * e) * 4.2;
      v.malla.rotation.set(e * 4, e * 3, 0);
      if (v.t >= 1) {
        v.activo = false;
        v.malla.visible = false;
      }
    }

    const elegido = seleccion !== null ? indiceDe.get(seleccion) : undefined;
    aro.visible = elegido !== undefined;
    if (elegido !== undefined) {
      aro.position.set(posiciones[elegido].x, 0.05, posiciones[elegido].z);
      aro.scale.setScalar(calmo ? 1 : 1 + Math.sin(t * 5) * 0.07);
      (aro.material as THREE.MeshBasicMaterial).opacity = calmo ? 0.9 : 0.65 + Math.sin(t * 5) * 0.25;
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
      for (const d of desechables) d.dispose();
      escena.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const material = m.material as THREE.Material | THREE.Material[] | undefined;
        for (const x of Array.isArray(material) ? material : material ? [material] : []) {
          const mapa = (x as THREE.SpriteMaterial).map;
          if (mapa) mapa.dispose();
          x.dispose();
        }
      });
      renderer.dispose();
      lona.remove();
    },
  };
}
