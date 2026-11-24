import { AGENTES, type Estacion, type EstadoEquipo, type IdAgente } from "@/lib/agenteia/respuesta";

/**
 * La oficina del equipo de Supri (panel lateral del Agente IA): una escena
 * pixel-art dibujada a mano en un canvas, sin React ni librerías. Cada agente
 * es un Supri (el león del panel) con la camisa de su color, que camina a la
 * estación de la herramienta que está usando y muestra un globo con lo que
 * hace. El estado lo manda el servidor en las marcas [[equipo:…]]
 * (lib/agenteia/respuesta.ts); aquí solo se anima.
 */

const W = 240;
const H = 150;

const CAB = [
  "...MMMMMM...",
  "..MMmMMmMM..",
  ".MMMFFFFMMM.",
  ".McFFFFFFMM.",
  ".MGGGFFGGGM.",
  ".MGfGffGfGM.",
  ".MMFfNNfFMM.",
  "..MMffffMM..",
  "...MMMMMM...",
];
const CUERPO = ["..SSSSSSSS..", ".HSsSSSSsSH.", ".HSSSSSSSSH."];
const CUERPO_CUADROS = ["..SsSsSsSs..", ".HsSsSsSsSH.", ".HSsSsSsSsH."];
const PIERNAS = [
  ["..PPP..PPP..", "..PPP..PPP..", "..BBB..BBB.."],
  ["..PPP..PPP..", "...PP..PP...", "...BB..BB..."],
];
const BASE: Record<string, string> = { M: "#1d3f7a", m: "#2f5fa8", c: "#4ade80", F: "#f2b84b", f: "#f8d78f", G: "#141414", N: "#6b3b2a", H: "#f2b84b", P: "#2b2f3a", B: "#f2f2f2" };

/** El sprite de un Supri (12×15 px) con su camisa; `paso` alterna las piernas al caminar. */
export function spriteSupri(camisa: [string, string], cuadros: boolean, paso: 0 | 1): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 12;
  c.height = 15;
  const g = c.getContext("2d")!;
  const col: Record<string, string> = { ...BASE, S: camisa[0], s: camisa[1] };
  [...CAB, ...(cuadros ? CUERPO_CUADROS : CUERPO), ...PIERNAS[paso]].forEach((fila, y) =>
    [...fila].forEach((k, x) => {
      if (col[k]) {
        g.fillStyle = col[k];
        g.fillRect(x, y, 1, 1);
      }
    }),
  );
  return c;
}

const EST: Record<Exclude<Estacion, "mesa">, { x: number; y: number; lbl: string; ly: number }> = {
  odoo: { x: 36, y: 56, lbl: "Odoo", ly: 41 },
  archivos: { x: 113, y: 56, lbl: "Archivos del panel", ly: 41 },
  internet: { x: 199, y: 56, lbl: "Internet", ly: 41 },
  escritorio: { x: 40, y: 104, lbl: "Escritorio", ly: 140 },
  caja: { x: 199, y: 104, lbl: "Caja y finanzas", ly: 140 },
};
const MESA: Record<IdAgente, { x: number; y: number }> = {
  sup: { x: 120, y: 92 },
  inv: { x: 90, y: 116 },
  com: { x: 104, y: 128 },
  ven: { x: 136, y: 128 },
  fin: { x: 150, y: 116 },
};
const DESVIO: Record<IdAgente, number> = { sup: 0, inv: -8, com: -3, ven: 3, fin: 8 };

interface Personaje {
  id: IdAgente;
  spr: [HTMLCanvasElement, HTMLCanvasElement];
  x: number;
  y: number;
  anim: number;
  mueve: boolean;
  globo: HTMLDivElement;
}

const ESTILO_GLOBO =
  "position:absolute;transform:translate(-50%,-100%);background:#fffdf7;color:#2a2a2a;border:2px solid #2a2a2a;" +
  "font:600 9px/1.3 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;padding:2px 5px;white-space:nowrap;" +
  "pointer-events:none;box-shadow:2px 2px 0 rgba(0,0,0,.18);max-width:46%;overflow:hidden;text-overflow:ellipsis";
const ESTILO_LBL =
  "position:absolute;transform:translateX(-50%);font:600 8px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;" +
  "color:#6b6355;white-space:nowrap;pointer-events:none;text-transform:uppercase;letter-spacing:.04em";

export function crearOficina(canvas: HTMLCanvasElement, capa: HTMLElement) {
  canvas.width = W;
  canvas.height = H;
  const cx = canvas.getContext("2d")!;
  const reducir = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

  const etiqueta = (txt: string, x: number, y: number) => {
    const l = document.createElement("div");
    l.style.cssText = `${ESTILO_LBL};left:${(x / W) * 100}%;top:${(y / H) * 100}%`;
    l.textContent = txt;
    capa.append(l);
  };
  Object.values(EST).forEach((e) => etiqueta(e.lbl, e.x, e.ly));
  etiqueta("Mesa de Supri", 120, 134);

  const personajes: Personaje[] = AGENTES.map((a) => {
    const globo = document.createElement("div");
    globo.style.cssText = ESTILO_GLOBO;
    globo.hidden = true;
    capa.append(globo);
    const casa = MESA[a.id];
    return {
      id: a.id,
      spr: [spriteSupri(a.camisa, a.id === "sup", 0), spriteSupri(a.camisa, a.id === "sup", 1)],
      x: casa.x,
      y: casa.y,
      anim: 0,
      mueve: false,
      globo,
    };
  });

  let estado: EstadoEquipo | null = null;

  const destino = (p: Personaje) => {
    const a = estado?.agentes[p.id];
    if (!a || a.estado !== "trabajando" || a.est === "mesa") return MESA[p.id];
    const e = EST[a.est];
    return { x: e.x + DESVIO[p.id], y: e.y };
  };

  const caja = (x: number, y: number, w: number, h: number, c: string) => {
    cx.fillStyle = c;
    cx.fillRect(x, y, w, h);
  };

  function fondo() {
    caja(0, 0, W, 40, "#ece6d8");
    caja(0, 38, W, 2, "#cfc6b2");
    for (let y = 40; y < H; y += 10) for (let x = 0; x < W; x += 10) caja(x, y, 10, 10, ((x + y) / 10) % 2 ? "#e6e0d2" : "#dfd8c8");
    // Odoo: estante de almacén con cajas
    caja(14, 8, 44, 30, "#7d7f86");
    caja(16, 10, 40, 26, "#5f6168");
    for (const [x, y, c] of [[17, 11, "#c98a3d"], [27, 11, "#b5762f"], [37, 11, "#d39a4c"], [47, 11, "#c98a3d"], [17, 24, "#b5762f"], [29, 24, "#d39a4c"], [41, 24, "#c98a3d"]] as const)
      caja(x, y, 8, 10, c);
    caja(16, 22, 40, 2, "#7d7f86");
    // Archivos del panel: biblioteca
    caja(92, 8, 42, 30, "#8a5a33");
    caja(94, 10, 38, 12, "#5e3c22");
    caja(94, 24, 38, 12, "#5e3c22");
    ["#d8473f", "#2f8fd8", "#f2b84b", "#2fa564", "#8a63d2", "#d8473f", "#2f8fd8", "#f2b84b", "#2fa564"].forEach((c, i) => {
      caja(95 + i * 4, 12, 3, 10, c);
      caja(95 + ((i + 3) % 9) * 4, 26, 3, 10, c);
    });
    // Internet: monitor en la pared
    caja(176, 8, 46, 28, "#2a2f3a");
    caja(179, 11, 40, 22, "#7cc3ea");
    cx.strokeStyle = "#2a2f3a";
    cx.lineWidth = 1.2;
    cx.beginPath();
    cx.arc(199, 22, 7, 0, Math.PI * 2);
    cx.moveTo(192, 22);
    cx.lineTo(206, 22);
    cx.moveTo(199, 15);
    cx.lineTo(199, 29);
    cx.stroke();
    // Escritorio con computadora
    caja(16, 108, 48, 6, "#8a5a33");
    caja(18, 114, 3, 16, "#6b4426");
    caja(59, 114, 3, 16, "#6b4426");
    caja(28, 96, 16, 12, "#2a2f3a");
    caja(30, 98, 12, 8, "#3fbf7a");
    caja(32, 100, 8, 1, "#e9fff2");
    caja(32, 103, 6, 1, "#e9fff2");
    // Caja y finanzas: mesa con calculadora y monedas
    caja(176, 108, 48, 6, "#8f949e");
    caja(178, 114, 3, 16, "#6f747e");
    caja(219, 114, 3, 16, "#6f747e");
    caja(184, 100, 10, 8, "#40444d");
    caja(185, 101, 8, 2, "#9fe3b7");
    for (const [x, y] of [[204, 104], [207, 102], [210, 104]] as const) caja(x, y, 4, 4, "#e2b13c");
  }

  function mesa() {
    caja(100, 96, 40, 10, "#8a5a33");
    caja(100, 106, 40, 2, "#6b4426");
    caja(104, 108, 3, 8, "#6b4426");
    caja(133, 108, 3, 8, "#6b4426");
    caja(106, 98, 8, 6, "#fffaf0");
    caja(118, 97, 10, 7, "#fffaf0");
    caja(130, 99, 6, 5, "#fffaf0");
  }

  let antes = performance.now();
  let raf = 0;
  function cuadro(ahora: number) {
    // El primer cuadro puede traer una hora anterior a `antes`: nunca un dt negativo.
    const dt = Math.max(0, Math.min(0.1, (ahora - antes) / 1000));
    antes = ahora;
    for (const p of personajes) {
      const d = destino(p);
      const dx = d.x - p.x;
      const dy = d.y - p.y;
      const dist = Math.hypot(dx, dy);
      const v = 46 * dt;
      if (reducir || dist <= v) {
        p.x = d.x;
        p.y = d.y;
        p.mueve = false;
      } else {
        p.x += (dx / dist) * v;
        p.y += (dy / dist) * v;
        p.mueve = true;
        p.anim += dt;
      }
      const a = estado?.agentes[p.id];
      const txt = a?.estado === "trabajando" && !p.mueve ? a.txt : "";
      p.globo.hidden = !txt;
      if (txt) {
        p.globo.textContent = txt;
        p.globo.style.left = `${(p.x / W) * 100}%`;
        // Cerca de los bordes el globo se corre hacia adentro para que no se corte.
        p.globo.style.transform = `translate(${p.x < 70 ? -12 : p.x > 170 ? -88 : -50}%, -100%)`;
        p.globo.style.top = `${((p.y - 17) / H) * 100}%`;
      }
    }
    cx.imageSmoothingEnabled = false;
    fondo();
    const cosas: { y: number; f: () => void }[] = personajes.map((p) => ({
      y: p.y,
      f: () => {
        const paso = p.mueve ? (Math.floor(p.anim * 6) % 2) as 0 | 1 : 0;
        caja(Math.round(p.x) - 5, Math.round(p.y) - 1, 10, 2, "rgba(0,0,0,.12)");
        cx.drawImage(p.spr[paso], Math.round(p.x) - 6, Math.round(p.y) - 15 - (p.mueve && paso ? 1 : 0));
      },
    }));
    cosas.push({ y: 100, f: mesa });
    cosas.sort((a, b) => a.y - b.y).forEach((c) => c.f());
    raf = requestAnimationFrame(cuadro);
  }
  raf = requestAnimationFrame(cuadro);

  return {
    actualizar(nuevo: EstadoEquipo | null) {
      estado = nuevo;
    },
    destruir() {
      cancelAnimationFrame(raf);
      capa.replaceChildren();
    },
  };
}
