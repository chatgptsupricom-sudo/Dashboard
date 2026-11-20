import { norm } from "@/lib/inteligencia-negocio/precios/leerLista";

/**
 * Clasificación por reglas, sin IA: el respaldo cuando no hay IA configurada
 * o falla. Son las reglas del tablero HTML de Inteligencia de Precios
 * (TYPE_RULES y subTemplate): el tipo de producto que aparece primero en la
 * descripción da la categoría y, en las categorías de cómputo, impresoras,
 * monitores, almacenamiento y UPS, se arma el nombre corto. Lo demás queda
 * con un nombre corto genérico y confianza baja para revisar.
 */

const TYPE_RULES: [RegExp, string][] = [
  [/\b(RELOJ INTELIGENTE|SMART ?WATCH|SMARTBAND|SMART RING|PULSERA INTELIGENTE)\b/, "WEARABLES"],
  [/\b(ECOTANK|SMART TANK|MEGA ?TANK|PIXMA|LASERJET|DESKJET|OFFICEJET|IMAGECLASS|WORKFORCE)\b/, "IMPRESORA"],
  [/\b(TONER|CARTUCHO|BOTELLA DE TINTA|CINTA|RIBBON|DRUM|TAMBOR)\b/, "CONSUMIBLES"],
  [/\b(COMBO|KIT) (DE )?(TECLADO|MOUSE)/, "COMBOS TECLADO Y MOUSE"],
  [/\bTECLADOS?\b|\bKEYBOARD\b/, "TECLADOS"],
  [/\bMOUSE ?PADS?\b|\bMOUSEPAD\b|\bMOUSE\b|\bRATON\b/, "MOUSE"],
  [/\b(AUDIFONOS?|AURICULARES?|HEADSET|HEADPHONES?|EARBUDS|EARPHONES?)\b/, "AUDIFONOS"],
  [/\b(CORNETAS?|ALTAVOZ|BOCINAS?|PARLANTES?|SPEAKERS?|BARRA DE SONIDO|SOUNDBAR)\b/, "CORNETAS"],
  [/\bMICROFONOS?\b/, "MICROFONOS"],
  [/\b(PROYECTOR|PROJECTOR)\b/, "PROYECTORES"],
  [/\bMONITOR\b(?! DE BEBE)/, "MONITORES"],
  [/\b(TELEVISOR|SMART TV|TV \d{2})/, "TELEVISORES Y PANTALLAS"],
  [/\b(ESTACION DE ENERGIA|POWER STATION|UPS|REGULADOR DE VOLTAJE|PROTECTOR DE VOLTAJE|REGLETA|INVERSOR|SURGEARREST)\b/, "UPS Y REGULADORES"],
  [/\b(POWER ?BANK|CARGADOR|CHARGER)\b/, "CARGADORES Y POWER BANKS"],
  [/\b(MOCHILA|MORRAL|BOLSO|MALETIN|BACKPACK|SLEEVE|FUNDA)\b/, "BOLSOS Y ESTUCHES"],
  [/\b(PENDRIVE|MEMORIA USB|USB FLASH|FLASH DRIVE|MICRO ?SD|DISCO DURO|DISCO SOLIDO|SSD|HDD|HARD DRIVE|CARCASA PARA DISCO)\b/, "ALMACENAMIENTO"],
  [/\b(ROUTER|MESH)\b/, "ROUTERING"],
  [/\b(SWITCH|ACCESS POINT|PUNTO DE ACCESO|ADAPTADOR DE RED|ANTENA|EXTENSOR|REPETIDOR|SFP|INYECTOR POE)\b/, "REDES"],
  [/\b(CAMARA WEB|WEBCAM)\b/, "CAMARAS WEB"],
  [/\b(CAMARA|NVR|DVR|VIDEOVIGILANCIA)\b/, "VIDEOVIGILANCIA"],
  [/\b(IMPRESORA|PLOTTER|MULTIFUNCIONAL|PRINTER)\b/, "IMPRESORA"],
  [/\b(ESCANER|SCANNER)\b/, "ESCANERES"],
  [/\b(LAPTOP|NOTEBOOK|PORTATIL)\b(?! ?(STAND|SOPORTE|BASE))/, "LAPTOP"],
  [/\b(ALL[ -]?IN[ -]?ONE|AIO)\b/, "AIO"],
  [/\b(SERVIDOR|SERVER|POWEREDGE|PROLIANT)\b/, "SERVIDORES"],
  [/\b(MINI PC|DESKTOP|COMPUTADOR|TORRE)\b/, "PC CORPORATIVA"],
  [/\b(TABLET|CELULAR|SMARTPHONE|IPHONE)\b/, "CELULARES Y TABLETS"],
  [/\b(CONSOLA|PLAYSTATION|XBOX|NINTENDO|GAMEPAD|VOLANTE)\b/, "GAMING"],
  [/\b(SILLA|ESCRITORIO|MESA)\b/, "MOBILIARIO"],
  [/\b(SOPORTE|BASE PARA|BRAZO|STAND)\b/, "SOPORTES Y BASES"],
  [/\b(BOMBILL[OA]|LAMPARA|LUZ LED|TIRA LED|ARO DE LUZ)\b/, "ILUMINACION"],
  [/\b(ENCHUFE INTELIGENTE|SENSOR|INTERRUPTOR INTELIGENTE|TIMBRE|CERRADURA|ECHO DOT|ALEXA)\b/, "HOGAR INTELIGENTE"],
  [/\b(PATCH CORD|PATCH PANEL|BOBINA|KEYSTONE|RJ45|RACK|GABINETE DE PARED)\b/, "CABLEADO Y RACKS"],
  [/\b(CABLE|ADAPTADOR|CONVERTIDOR|HUB|DOCKING|SPLITTER|EXTENSION)\b/, "CABLES Y ADAPTADORES"],
  [/\b(PAPEL|ETIQUETAS?|ROLLO TERMICO|RESMA)\b/, "PAPELERIA"],
  [/\b(LICENCIA|SOFTWARE|ANTIVIRUS|OFFICE 365|MICROSOFT 365|WINDOWS 11)\b/, "SOFTWARE"],
  [/\b(MEMORIA RAM|DDR[345]|SODIMM|UDIMM)\b/, "MEMORIA RAM"],
  [/\b(PROCESADOR|CPU)\b/, "PROCESADORES"],
  [/\b(TARJETA MADRE|MOTHERBOARD|PLACA BASE)\b/, "TARJETAS MADRE"],
  [/\b(TARJETA DE VIDEO|RTX|GTX|RADEON RX)\b/, "TARJETAS DE VIDEO"],
  [/\b(FUENTE DE PODER|PSU)\b/, "FUENTES DE PODER"],
  [/\b(GABINETE|CASE)\b/, "CASES"],
  [/\b(VENTILADOR|COOLER|DISIPADOR|ENFRIAMIENTO|ENFRIADOR)\b/, "REFRIGERACION"],
  [/\b(PILAS?|BATERIAS?)\b/, "BATERIAS Y PILAS"],
  [/\b(CAJON MONEDERO|GAVETA|LECTOR DE CODIGO|CONTADORA DE BILLETES|BALANZA)\b/, "PUNTO DE VENTA"],
  [/\b(RADIO|WALKIE|TELEFONO IP)\b/, "TELEFONIA Y RADIOS"],
];

function categoriaPorTipo(t: string): string {
  let mejor: { c: string; i: number } | null = null;
  for (const [re, c] of TYPE_RULES) {
    const m = t.match(re);
    if (m && m.index !== undefined && (!mejor || m.index < mejor.i)) mejor = { c, i: m.index };
  }
  return mejor ? mejor.c : "";
}

const CPU = (t: string) => {
  let m;
  if ((m = t.match(/\bCORE\s*ULTRA\s*(\d)|\bU([579])[\s-]\d{3}/))) return "Core Ultra " + (m[1] || m[2]);
  if ((m = t.match(/\b(?:CORE\s*)?I([3579])[\s-]?\d{3,5}|\bCORE\s*I([3579])\b|\bI([3579])\b/))) return "Core i" + (m[1] || m[2] || m[3]);
  if ((m = t.match(/\bRYZEN\s*(?:AI\s*)?(\d)/))) return "Ryzen " + m[1];
  for (const [re, v] of [
    [/CELERON|N4500|N4020|\bN100\b|\bN200\b/, "Celeron"],
    [/PENTIUM/, "Pentium"],
    [/ATHLON/, "Athlon"],
    [/SNAPDRAGON/, "Snapdragon"],
    [/XEON/, "Xeon"],
    [/\bM[1-5]\b/, "Apple M"],
  ] as [RegExp, string][])
    if (re.test(t)) return v;
  return "";
};
const RAM = (t: string) => {
  const m = t.match(/\b(4|8|12|16|18|24|32|36|48|64|96|128)\s*GB\b(?!\s*(SSD|HDD|EMMC|M\.?2|NVME))/);
  return m ? m[1] + "GB" : "";
};
const STO = (t: string) => {
  const m = t.match(/\b(\d(?:\.\d)?)\s*TB\b/) || t.match(/\b(128|256|500|512|1000|1024|2000)\s*GB\b/);
  if (!m) return "";
  const v = /TB/.test(m[0]) ? m[1] + "TB" : m[1] === "1000" || m[1] === "1024" ? "1TB" : m[1] === "2000" ? "2TB" : m[1] + "GB";
  return v + (/HDD|DISCO DURO/.test(t) && !/SSD/.test(t) ? " HDD" : " SSD");
};
const INCH = (t: string) => {
  const m = t.match(/\b(\d{2}(?:[.,]\d)?)\s*(?:"|''|”|PULG|IN\b|INCH)/);
  return m ? m[1].replace(",", ".") + '"' : "";
};
const GPU = (t: string) => {
  const m = t.match(/\b(RTX|GTX)\s*-?\s*(\d{4})/);
  return m ? m[1] + " " + m[2] : "";
};
const j = (a: string[]) => a.filter(Boolean).join(" ");

function nombreCorto(cat: string, t: string): string {
  switch (cat) {
    case "LAPTOP": {
      const c = CPU(t);
      return c ? j(["Laptop", c, RAM(t), STO(t), /GAMING|GAMER|RTX|GTX/.test(t) ? GPU(t) : ""]) : "";
    }
    case "AIO": {
      const c = CPU(t);
      return c ? j(["AIO", INCH(t), c, RAM(t), STO(t)]) : "";
    }
    case "PC CORPORATIVA": {
      const c = CPU(t);
      return c ? j(["PC Corporativa", c, RAM(t), STO(t)]) : "";
    }
    case "MONITORES": {
      const i = INCH(t);
      if (!i) return "";
      const r = /\b(4K|UHD|3840)\b/.test(t) ? "4K" : /\b(QHD|WQHD|2K|2560)\b/.test(t) ? "QHD" : /\b(FHD|FULL ?HD|1080P?|1920)\b/.test(t) ? "FHD" : "";
      const hz = (t.match(/\b(\d{2,3})\s*HZ\b/) || [])[1];
      const pn = (t.match(/\b(IPS|VA|TN|OLED)\b/) || [])[1];
      return j(["Monitor", i, r, hz ? hz + "Hz" : "", pn || ""]);
    }
    case "IMPRESORA": {
      const fn = /MULTIFUNCI|AIO|ALL[ -]?IN[ -]?ONE|\bMFP?\b|COPIA|ESCANE/.test(t) ? "Multifuncional" : "Solo Impresión";
      const ty = /TERMIC|ETIQUET|RECIBO|TICKET/.test(t)
        ? "Térmica de Recibos/Etiquetas"
        : /MATRIZ|MATRICIAL|LQ-?\d|FX-?\d/.test(t)
          ? "Matriz de Punto"
          : /SUBLIMA/.test(t)
            ? "Sublimación"
            : /LASER|LBP|LASERJET|IMAGECLASS/.test(t)
              ? /COLOR/.test(t)
                ? "Láser Color"
                : "Láser Mono"
              : /TANQUE|ECOTANK|SMART TANK|MEGA ?TANK|TINTA CONTINUA/.test(t)
                ? "Tinta Continua"
                : /TINTA|PIXMA|DESKJET|INYECCION/.test(t)
                  ? "Inyección"
                  : "";
      return ty ? j(["Impresora", ty.startsWith("Térmica") ? "Solo Impresión" : fn, ty]) : "";
    }
    case "ALMACENAMIENTO": {
      const cm = t.match(/\b(\d{1,4}(?:\.\d)?)\s*(GB|TB)\b/);
      const cap = cm ? cm[1] + cm[2] : "";
      if (/PENDRIVE|MEMORIA USB|USB FLASH|FLASH DRIVE/.test(t)) return j(["Pendrive", "USB", cap]);
      if (/MICRO ?SD/.test(t)) return j(["Memoria MicroSD", cap]);
      if (/\bSSD\b|SOLIDO/.test(t)) return j(["SSD", /NVME|PCIE/.test(t) ? "M.2 NVMe" : /M\.?2/.test(t) ? "M.2 SATA" : /SATA|2\.5/.test(t) ? 'SATA 2.5"' : "", cap]);
      if (/DISCO DURO|HARD DRIVE|\bHDD\b/.test(t)) return j([/EXTERN|PORTATIL|USB/.test(t) ? "Disco Duro Externo" : "Disco Duro", cap]);
      return "";
    }
    case "UPS Y REGULADORES": {
      const va = (t.match(/\b(\d{3,5})\s*VA\b/) || [])[1];
      const w = (t.match(/\b(\d{2,5})\s*W\b/) || [])[1];
      const wh = (t.match(/\b(\d{2,5})\s*WH\b/) || [])[1];
      if (/ESTACION DE ENERGIA|POWER STATION/.test(t)) return j(["Estación de Energía", w ? w + "W" : "", wh ? wh + "Wh" : ""]);
      if (/REGULADOR|AVR/.test(t)) return j(["Regulador de Voltaje", va ? va + "VA" : "", w ? w + "W" : ""]);
      if (/PROTECTOR|SURGEARREST/.test(t)) return j(["Protector de Voltaje", w ? w + "W" : ""]);
      if (/INVERSOR/.test(t)) return j(["Inversor", w ? w + "W" : ""]);
      if (/\bUPS\b/.test(t)) return j(["UPS", /ONLINE|ON-LINE|ON LINE/.test(t) ? "Online" : /INTERACTIV/.test(t) ? "Interactivo" : "", va ? va + "VA" : "", w ? w + "W" : ""]);
      return "";
    }
  }
  return "";
}

const titulo = (s: string) =>
  s
    .toLowerCase()
    .split(" ")
    .map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");

export function clasificarPorReglas(descripcion: string, linea: string): { categoria: string; subcategoria: string; confianza: number; observaciones: string } {
  const t = norm(descripcion).replace(/(\d),(\d{3})(?!\d)/g, "$1$2");
  const categoria = categoriaPorTipo(t) || categoriaPorTipo(norm(linea)) || "ACCESORIOS VARIOS";
  const corto = nombreCorto(categoria, t);
  return {
    categoria,
    subcategoria: corto || titulo(norm(linea) || categoria),
    confianza: corto ? 0.65 : 0.5,
    observaciones: "Clasificado por reglas, sin IA: revisar",
  };
}
