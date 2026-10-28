import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { ZONAS_MAPA, claveZona, type PaisMapa } from "@/lib/mapaClientes/zonas";

/**
 * Mapa de clientes en 3D: cada estado es un bloque con su forma real, más alto
 * y más intenso cuantos más clientes tiene. Se gira, se inclina y se acerca
 * con el ratón o con los dedos; al pasar o tocar un estado se avisa a la
 * pantalla para que muestre la zona y la cantidad.
 *
 * three.js a mano, sin React (como lib/mantenimiento/escena3d): la pantalla lo
 * monta en un <div> y le pasa las figuras del geojson y los conteos.
 *
 * Solo navegador (usa WebGL y `document`): se carga con import() dinámico.
 */

type Punto = [number, number];
/** Polígono = anillo exterior + huecos, en [lon, lat]. */
type Poligono = Punto[][];

export type FiguraZona = { clave: string; poligonos: Poligono[] };
export type ZonaMapa3D = { clave: string; nombre: string; clientes: number };

export type OpcionesMapa3D = {
  /** Zona bajo el puntero (null = ninguna), en px dentro del contenedor. */
  onEncima: (clave: string | null, x: number, y: number) => void;
  onSeleccion: (clave: string | null) => void;
  movimientoReducido?: boolean;
  oscuro?: boolean;
};

export type Mapa3D = {
  dibujar: (figuras: FiguraZona[], zonas: ZonaMapa3D[]) => void;
  seleccionar: (clave: string | null) => void;
  resaltar: (clave: string | null) => void;
  tema: (oscuro: boolean) => void;
  /** Vuelve a la vista inicial. */
  centrar: () => void;
  /** < 1 acerca, > 1 aleja. */
  acercar: (factor: number) => void;
  destruir: () => void;
};

/** Figuras del geojson de un país que tienen zona (Isla de Aves, sin nombre, no). */
export function figurasDelGeojson(geojson: any, pais: PaisMapa): FiguraZona[] {
  const zonas = ZONAS_MAPA[pais];
  const porClave = new Map<string, Poligono[]>();
  for (const f of geojson?.features ?? []) {
    const p = f?.properties ?? {};
    const clave = claveZona(p.name || p.NAME_1 || p.NAME);
    if (!clave || !zonas[clave] || !f.geometry) continue;
    const g = f.geometry;
    const poligonos: Poligono[] = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
    porClave.set(clave, [...(porClave.get(clave) ?? []), ...poligonos]);
  }
  return [...porClave].map(([clave, poligonos]) => ({ clave, poligonos }));
}

/** Lo ancho del país en unidades de la escena. */
const ANCHO = 100;
const ALTURA_MAX = 15;
const ALTURA_MIN = 0.9;
const ALTURA_VACIA = 0.35;
/** Cuántos estados llevan su número flotando encima. */
const ROTULOS = 8;
/** Inclinación inicial de la cámara (rad desde la vertical). */
const INCLINACION = 0.88;

const PALETA = {
  claro: {
    escala: ["#bae6fd", "#38bdf8", "#6366f1", "#7c3aed"],
    vacio: "#e2e8f0",
    borde: 0xffffff,
    rejilla: 0x94a3b8,
    sombra: 0.16,
  },
  oscuro: {
    escala: ["#0c4a6e", "#0ea5e9", "#818cf8", "#c084fc"],
    vacio: "#1e293b",
    borde: 0xe2e8f0,
    rejilla: 0x475569,
    sombra: 0.4,
  },
};

type Actor = {
  zona: ZonaMapa3D;
  malla: THREE.Mesh;
  tapa: THREE.MeshStandardMaterial;
  lados: THREE.MeshStandardMaterial;
  bordes: THREE.Group;
  centro: THREE.Vector3;
  alto: number;
  /** 0..1, para el color. */
  intensidad: number;
  retraso: number;
  rotulo: HTMLDivElement | null;
};

export function crearMapa3D(contenedor: HTMLElement, opciones: OpcionesMapa3D): Mapa3D {
  const calmo = opciones.movimientoReducido === true;
  let oscuro = opciones.oscuro === true;

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
  // El mapa se maneja con los dedos; la página se mueve tocando fuera de él.
  lona.style.touchAction = "none";
  contenedor.appendChild(lona);

  const capa = document.createElement("div");
  Object.assign(capa.style, { position: "absolute", inset: "0", pointerEvents: "none", overflow: "hidden" });
  contenedor.appendChild(capa);

  const escena = new THREE.Scene();
  const camara = new THREE.PerspectiveCamera(38, 2, 0.5, 1000);
  const controles = new OrbitControls(camara, lona);
  controles.enableDamping = true;
  controles.dampingFactor = 0.08;
  controles.rotateSpeed = 0.6;
  controles.screenSpacePanning = false;
  controles.minPolarAngle = 0;
  controles.maxPolarAngle = 1.35;

  // La rueda solo acerca con Ctrl (o ⌘): sin eso, mueve la página como siempre.
  const alRodar = (ev: WheelEvent) => {
    if (!ev.ctrlKey && !ev.metaKey) ev.stopPropagation();
  };
  contenedor.addEventListener("wheel", alRodar, { capture: true });

  // Luces
  const cielo = new THREE.HemisphereLight(0xffffff, 0x94a3b8, 1.6);
  escena.add(cielo);
  const sol = new THREE.DirectionalLight(0xffffff, 1.9);
  sol.position.set(-40, 90, 50);
  sol.castShadow = true;
  const ancho = window.innerWidth < 640 ? 1024 : 2048;
  sol.shadow.mapSize.set(ancho, ancho);
  Object.assign(sol.shadow.camera, { left: -80, right: 80, top: 80, bottom: -80, near: 1, far: 260 });
  sol.shadow.bias = -0.0005;
  escena.add(sol);
  const contraluz = new THREE.DirectionalLight(0x93c5fd, 0.5);
  contraluz.position.set(60, 40, -60);
  escena.add(contraluz);

  // Piso: solo recibe la sombra, más una rejilla tenue.
  const materialPiso = new THREE.ShadowMaterial({ opacity: PALETA.claro.sombra });
  const piso = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), materialPiso);
  piso.rotation.x = -Math.PI / 2;
  piso.position.y = -0.01;
  piso.receiveShadow = true;
  escena.add(piso);
  let rejilla = crearRejilla();
  escena.add(rejilla);

  function crearRejilla() {
    const r = new THREE.GridHelper(320, 64, PALETA[oscuro ? "oscuro" : "claro"].rejilla, PALETA[oscuro ? "oscuro" : "claro"].rejilla);
    const m = r.material as THREE.Material;
    m.transparent = true;
    m.opacity = oscuro ? 0.22 : 0.18;
    r.position.y = -0.02;
    return r;
  }

  const actores = new Map<string, Actor>();
  const bordesMaterial = new THREE.LineBasicMaterial({ color: PALETA.claro.borde, transparent: true, opacity: 0.55 });
  let tamano = { ancho: ANCHO, fondo: ANCHO };
  let inicio = performance.now();
  let seleccion: string | null = null;
  let resaltado: string | null = null;
  let encima: string | null = null;
  const objetivo = new THREE.Vector3();
  let entrada = calmo ? 1 : 0;

  // ── Dibujo ───────────────────────────────────────────────────────────────
  function limpiar() {
    for (const a of actores.values()) {
      escena.remove(a.malla, a.bordes);
      a.malla.geometry.dispose();
      a.tapa.dispose();
      a.lados.dispose();
      a.bordes.traverse((o) => (o as THREE.Line).geometry?.dispose());
      a.rotulo?.remove();
    }
    actores.clear();
  }

  function dibujar(figuras: FiguraZona[], zonas: ZonaMapa3D[]) {
    limpiar();
    // Mercator a mano, ajustado para que lo ancho del país mida ANCHO.
    const mercator = ([lon, lat]: Punto): Punto => [
      (lon * Math.PI) / 180,
      Math.log(Math.tan(Math.PI / 4 + (Math.max(-85, Math.min(85, lat)) * Math.PI) / 360)),
    ];
    let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const f of figuras)
      for (const pol of f.poligonos)
        for (const [lon, lat] of pol[0] ?? []) {
          const [x, y] = mercator([lon, lat]);
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
    if (!Number.isFinite(minX)) return;
    const escala = ANCHO / Math.max(maxX - minX, maxY - minY);
    const [cx, cy] = [(minX + maxX) / 2, (minY + maxY) / 2];
    tamano = { ancho: (maxX - minX) * escala, fondo: (maxY - minY) * escala };
    // En la figura, y = norte; al acostarla, el norte queda al fondo (-z).
    const plano = (p: Punto): Punto => {
      const [x, y] = mercator(p);
      return [(x - cx) * escala, (y - cy) * escala];
    };

    const porClave = new Map(zonas.map((z) => [z.clave, z]));
    const maximo = Math.max(1, ...zonas.map((z) => z.clientes));
    const orden = [...zonas].filter((z) => z.clientes > 0).sort((a, b) => b.clientes - a.clientes);
    const conRotulo = new Set(orden.slice(0, ROTULOS).map((z) => z.clave));

    for (const f of figuras) {
      const zona = porClave.get(f.clave) ?? { clave: f.clave, nombre: f.clave, clientes: 0 };
      const formas: THREE.Shape[] = [];
      const bordes = new THREE.Group();
      let mayor = { area: 0, x: 0, y: 0 };
      for (const pol of f.poligonos) {
        const [exterior, ...huecos] = pol.map((anillo) => anillo.map(plano));
        if (!exterior || exterior.length < 3) continue;
        const forma = new THREE.Shape(exterior.map(([x, y]) => new THREE.Vector2(x, y)));
        for (const h of huecos) if (h.length >= 3) forma.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
        formas.push(forma);
        const c = centroide(exterior);
        if (c.area > mayor.area) mayor = c;
        const linea = new THREE.LineLoop(
          new THREE.BufferGeometry().setFromPoints(exterior.map(([x, y]) => new THREE.Vector3(x, 0, -y))),
          bordesMaterial,
        );
        bordes.add(linea);
      }
      if (!formas.length) continue;

      const geometria = new THREE.ExtrudeGeometry(formas, { depth: 1, bevelEnabled: false, curveSegments: 1 });
      const tapa = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.08 });
      const lados = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.05 });
      const malla = new THREE.Mesh(geometria, [tapa, lados]);
      malla.rotation.x = -Math.PI / 2;
      malla.scale.z = 0.001;
      malla.castShadow = true;
      malla.receiveShadow = true;
      malla.userData.clave = f.clave;
      escena.add(malla, bordes);

      const intensidad = zona.clientes > 0 ? Math.sqrt(zona.clientes / maximo) : 0;
      const alto = zona.clientes > 0 ? ALTURA_MIN + (ALTURA_MAX - ALTURA_MIN) * intensidad : ALTURA_VACIA;
      const centro = new THREE.Vector3(mayor.x, 0, -mayor.y);
      let rotulo: HTMLDivElement | null = null;
      if (zona.clientes > 0) {
        rotulo = document.createElement("div");
        Object.assign(rotulo.style, {
          position: "absolute",
          left: "0",
          top: "0",
          transform: "translate(-9999px, 0)",
          padding: "2px 8px",
          borderRadius: "9999px",
          font: "600 12px/1.4 ui-sans-serif, system-ui, sans-serif",
          whiteSpace: "nowrap",
          boxShadow: "0 4px 14px rgba(15, 23, 42, .18)",
          transition: "opacity .25s",
          opacity: "0",
        });
        rotulo.textContent = zona.clientes.toLocaleString("es");
        rotulo.dataset.fijo = conRotulo.has(f.clave) ? "1" : "";
        capa.appendChild(rotulo);
      }
      actores.set(f.clave, {
        zona,
        malla,
        tapa,
        lados,
        bordes,
        centro,
        alto,
        intensidad,
        // La ola de subida va de oeste a este.
        retraso: 0.15 + ((mayor.x + tamano.ancho / 2) / Math.max(1, tamano.ancho)) * 0.7,
        rotulo,
      });
    }
    pintar();
    inicio = performance.now();
    entrada = calmo ? 1 : 0;
    ajustar(true);
  }

  // ── Colores ──────────────────────────────────────────────────────────────
  function colorDe(intensidad: number, vacio: boolean): THREE.Color {
    const p = PALETA[oscuro ? "oscuro" : "claro"];
    if (vacio) return new THREE.Color(p.vacio);
    const tramos = p.escala.length - 1;
    const t = Math.min(1, Math.max(0, intensidad)) * tramos;
    const i = Math.min(tramos - 1, Math.floor(t));
    return new THREE.Color(p.escala[i]).lerp(new THREE.Color(p.escala[i + 1]), t - i);
  }

  function pintar() {
    const p = PALETA[oscuro ? "oscuro" : "claro"];
    const apagado = new THREE.Color(p.vacio);
    const activo = encima ?? resaltado;
    for (const [clave, a] of actores) {
      const base = colorDe(a.intensidad, a.zona.clientes === 0);
      // Con un estado elegido, los demás se apagan un poco.
      if (seleccion && clave !== seleccion) base.lerp(apagado, 0.55);
      a.tapa.color.copy(base);
      a.lados.color.copy(base).multiplyScalar(oscuro ? 0.6 : 0.78);
      const brillo = clave === seleccion ? 0.32 : clave === activo ? 0.22 : 0;
      a.tapa.emissive.copy(base).multiplyScalar(brillo);
      a.lados.emissive.copy(base).multiplyScalar(brillo * 0.6);
      if (a.rotulo) {
        a.rotulo.style.background = oscuro ? "rgba(15, 23, 42, .88)" : "rgba(255, 255, 255, .94)";
        a.rotulo.style.color = oscuro ? "#e2e8f0" : "#0f172a";
        a.rotulo.style.border = `1px solid ${clave === seleccion || clave === activo ? "#6366f1" : oscuro ? "rgba(148, 163, 184, .35)" : "rgba(148, 163, 184, .45)"}`;
      }
    }
    bordesMaterial.color.set(p.borde);
    bordesMaterial.opacity = oscuro ? 0.35 : 0.6;
    materialPiso.opacity = p.sombra;
  }

  // ── Cámara ───────────────────────────────────────────────────────────────
  let distanciaBase = 120;
  function ajustar(reiniciar = false) {
    const w = Math.max(1, contenedor.clientWidth);
    const h = Math.max(1, contenedor.clientHeight);
    renderer.setSize(w, h, false);
    camara.aspect = w / h;
    const vfov = THREE.MathUtils.degToRad(camara.fov);
    const tan = Math.tan(vfov / 2);
    // Lo que tiene que entrar: el ancho del país y su fondo inclinado.
    const porAncho = tamano.ancho / 2 / (tan * camara.aspect);
    const porFondo = (tamano.fondo * Math.cos(INCLINACION) + ALTURA_MAX * Math.sin(INCLINACION)) / 2 / tan;
    distanciaBase = Math.max(porAncho, porFondo) * 1.12 + tamano.fondo * 0.25;
    controles.minDistance = distanciaBase * 0.25;
    controles.maxDistance = distanciaBase * 2.2;
    if (reiniciar) {
      objetivo.set(0, 0, 0);
      controles.target.set(0, 0, 0);
      camara.position.set(0, Math.cos(INCLINACION), Math.sin(INCLINACION)).multiplyScalar(distanciaBase);
    } else {
      const d = camara.position.clone().sub(controles.target);
      const largo = THREE.MathUtils.clamp(d.length(), controles.minDistance, controles.maxDistance);
      camara.position.copy(controles.target).add(d.setLength(largo));
    }
    camara.near = distanciaBase / 200;
    camara.far = distanciaBase * 10;
    camara.updateProjectionMatrix();
  }
  ajustar(true);
  const observador = new ResizeObserver(() => ajustar());
  observador.observe(contenedor);

  // ── Toques ───────────────────────────────────────────────────────────────
  const rayo = new THREE.Raycaster();
  const puntero = new THREE.Vector2();
  const zonaEn = (ev: PointerEvent): string | null => {
    const r = lona.getBoundingClientRect();
    puntero.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    rayo.setFromCamera(puntero, camara);
    const [toque] = rayo.intersectObjects([...actores.values()].map((a) => a.malla), false);
    return toque ? ((toque.object.userData.clave as string) ?? null) : null;
  };
  const posicion = (ev: PointerEvent) => {
    const r = contenedor.getBoundingClientRect();
    return [ev.clientX - r.left, ev.clientY - r.top] as const;
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
    const clave = zonaEn(ev);
    if (ev.pointerType !== "mouse") {
      encima = clave;
      opciones.onEncima(clave, ...posicion(ev));
    }
    opciones.onSeleccion(clave === seleccion ? null : clave);
  };
  const alMover = (ev: PointerEvent) => {
    if (ev.pointerType !== "mouse") return;
    if (abajo) {
      // Girando: sin cartel.
      if (encima) {
        encima = null;
        pintar();
        opciones.onEncima(null, 0, 0);
      }
      return;
    }
    const clave = zonaEn(ev);
    lona.style.cursor = clave ? "pointer" : "grab";
    if (clave !== encima) {
      encima = clave;
      pintar();
    }
    opciones.onEncima(clave, ...posicion(ev));
  };
  const alSalir = (ev: PointerEvent) => {
    if (ev.pointerType !== "mouse") return;
    encima = null;
    pintar();
    opciones.onEncima(null, 0, 0);
  };
  lona.addEventListener("pointerdown", alBajar);
  lona.addEventListener("pointerup", alSubir);
  lona.addEventListener("pointermove", alMover);
  lona.addEventListener("pointerleave", alSalir);

  // ── Bucle ────────────────────────────────────────────────────────────────
  let visible = true;
  const enPantalla = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
  });
  enPantalla.observe(contenedor);
  const vector = new THREE.Vector3();
  let cuadro = 0;

  const bucle = (ahora: number) => {
    cuadro = requestAnimationFrame(bucle);
    if (!visible) return;
    const t = (ahora - inicio) / 1000;

    // Entrada: la cámara baja desde arriba mientras los estados suben.
    if (entrada < 1) {
      entrada = Math.min(1, t / 1.8);
      const k = suave(entrada);
      const angulo = THREE.MathUtils.lerp(0.15, INCLINACION, k);
      const largo = THREE.MathUtils.lerp(distanciaBase * 1.5, distanciaBase, k);
      camara.position.set(0, Math.cos(angulo), Math.sin(angulo)).multiplyScalar(largo).add(controles.target);
    }

    for (const a of actores.values()) {
      const k = calmo ? 1 : rebote(THREE.MathUtils.clamp((t - a.retraso) / 1.1, 0, 1));
      const alto = Math.max(0.001, a.alto * k);
      a.malla.scale.z = alto;
      a.bordes.position.y = alto + 0.03;
    }

    // Al elegir un estado, la cámara se corre hacia él.
    const paso = vector.copy(objetivo).sub(controles.target).multiplyScalar(calmo ? 1 : 0.08);
    if (paso.lengthSq() > 1e-6) {
      controles.target.add(paso);
      camara.position.add(paso);
    }
    controles.update();
    renderer.render(escena, camara);

    // Rótulos: los estados con más clientes, y el señalado o elegido. Si dos
    // se pisan (Distrito Capital, Miranda, Aragua y Carabobo están pegados),
    // queda el de más prioridad.
    const w = contenedor.clientWidth;
    const h = contenedor.clientHeight;
    const activo = encima ?? resaltado;
    const puestos: Array<[number, number, number, number]> = [];
    for (const a of porPrioridad(activo)) {
      const rotulo = a.rotulo!;
      const clave = a.zona.clave;
      const mostrar = rotulo.dataset.fijo === "1" || clave === activo || clave === seleccion;
      vector.set(a.centro.x, a.malla.scale.z + 1.2, a.centro.z).project(camara);
      const dentro = vector.z < 1 && Math.abs(vector.x) < 1.1 && Math.abs(vector.y) < 1.1;
      const x = ((vector.x + 1) / 2) * w;
      const y = ((1 - vector.y) / 2) * h;
      const medio = (16 + 7.5 * (rotulo.textContent?.length ?? 1)) / 2;
      const caja: [number, number, number, number] = [x - medio, y - 22, x + medio, y];
      const libre = !puestos.some(([x0, y0, x1, y1]) => caja[0] < x1 && caja[2] > x0 && caja[1] < y1 && caja[3] > y0);
      const ver = mostrar && dentro && libre && entrada >= 1;
      if (ver) puestos.push(caja);
      rotulo.style.opacity = ver ? "1" : "0";
      rotulo.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
      rotulo.style.zIndex = clave === activo || clave === seleccion ? "2" : "1";
    }
  };

  /** Con rótulo: primero el elegido y el señalado, después por cantidad. */
  function porPrioridad(activo: string | null): Actor[] {
    const peso = (a: Actor) => (a.zona.clave === seleccion ? 2e9 : a.zona.clave === activo ? 1e9 : a.zona.clientes);
    return [...actores.values()].filter((a) => a.rotulo).sort((a, b) => peso(b) - peso(a));
  }
  cuadro = requestAnimationFrame(bucle);

  return {
    dibujar,
    seleccionar(clave) {
      seleccion = clave && actores.has(clave) ? clave : null;
      const a = seleccion ? actores.get(seleccion) : null;
      objetivo.set(a ? a.centro.x * 0.6 : 0, 0, a ? a.centro.z * 0.6 : 0);
      pintar();
    },
    resaltar(clave) {
      resaltado = clave;
      pintar();
    },
    tema(nuevo) {
      if (nuevo === oscuro) return;
      oscuro = nuevo;
      escena.remove(rejilla);
      rejilla.geometry.dispose();
      (rejilla.material as THREE.Material).dispose();
      rejilla = crearRejilla();
      escena.add(rejilla);
      pintar();
    },
    centrar() {
      entrada = 1;
      ajustar(true);
      if (seleccion) {
        const a = actores.get(seleccion);
        if (a) objetivo.set(a.centro.x * 0.6, 0, a.centro.z * 0.6);
      }
    },
    acercar(factor) {
      const d = camara.position.clone().sub(controles.target);
      const largo = THREE.MathUtils.clamp(d.length() * factor, controles.minDistance, controles.maxDistance);
      camara.position.copy(controles.target).add(d.setLength(largo));
    },
    destruir() {
      cancelAnimationFrame(cuadro);
      observador.disconnect();
      enPantalla.disconnect();
      contenedor.removeEventListener("wheel", alRodar, { capture: true });
      lona.removeEventListener("pointerdown", alBajar);
      lona.removeEventListener("pointerup", alSubir);
      lona.removeEventListener("pointermove", alMover);
      lona.removeEventListener("pointerleave", alSalir);
      controles.dispose();
      limpiar();
      bordesMaterial.dispose();
      piso.geometry.dispose();
      materialPiso.dispose();
      rejilla.geometry.dispose();
      (rejilla.material as THREE.Material).dispose();
      renderer.dispose();
      lona.remove();
      capa.remove();
    },
  };
}

/** Centroide y área de un anillo (fórmula del polígono), en el plano. */
function centroide(anillo: Punto[]): { area: number; x: number; y: number } {
  let a = 0;
  let x = 0;
  let y = 0;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [x0, y0] = anillo[j];
    const [x1, y1] = anillo[i];
    const f = x0 * y1 - x1 * y0;
    a += f;
    x += (x0 + x1) * f;
    y += (y0 + y1) * f;
  }
  if (Math.abs(a) < 1e-9) {
    const n = Math.max(1, anillo.length);
    return { area: 0, x: anillo.reduce((s, p) => s + p[0], 0) / n, y: anillo.reduce((s, p) => s + p[1], 0) / n };
  }
  return { area: Math.abs(a / 2), x: x / (3 * a), y: y / (3 * a) };
}

function suave(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** Sube y se pasa un poquito antes de asentarse. */
function rebote(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const c = 1.4;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
}
