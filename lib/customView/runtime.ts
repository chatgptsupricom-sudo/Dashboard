/**
 * Runtime que el servidor inyecta dentro del HTML del Plan de Contenido.
 *
 * Idea general
 * ------------
 * El HTML subido es la BASE y nunca se modifica. Lo que el equipo hace dentro
 * del panel (marcar, arrastrar, editar texto, agregar o borrar piezas) se
 * guarda de dos formas complementarias:
 *
 *   1. `state`    -> diff estructural contra la base, con llaves estables
 *                    (data-piece / id / dia del calendario). Es lo que permite
 *                    volver a aplicar los cambios sobre un HTML nuevo.
 *   2. `snapshot` -> el HTML completo del panel tal como se ve. Copia literal,
 *                    para descarga, historial y respaldo.
 *
 * Al subir un HTML nuevo cambia la base, el overlay se reaplica encima y el
 * resultado se vuelve a guardar: el panel queda con el contenido nuevo mas
 * todo lo que ya se habia hecho.
 */
export const PLAN_RUNTIME_JS = String.raw`
(function () {
  "use strict";

  var CFG = window.__PLAN_CFG__ || {};
  var API = CFG.api || "/api/adminleads/custom-view";
  var SOCKET_URL = CFG.socketUrl || "";
  var CAN_EDIT = CFG.canEdit !== false;
  // Sufijo de vista: en la sandbox de pruebas todas las llamadas deben ir a la
  // misma vista, si no se mezclarian con el plan real.
  var VIEW_QS = CFG.view ? "?view=" + encodeURIComponent(CFG.view) : "";
  // Interruptor: la replicacion selectiva solo corre en la sandbox de pruebas.
  var LIVE_SELECTIVO = CFG.view === "adminleads__sandbox";
  var MY_VIEW = CFG.view || "adminleads";
  var CLIENT_ID = "c" + Math.random().toString(36).slice(2) + Date.now().toString(36);

  // Elementos cuyo CONTENIDO no se compara (pero se conservan en su sitio).
  var IGNORE_SEL = "script,style,link,noscript,template";
  // Elementos que quedan totalmente fuera del modelo: overlays efimeros que el
  // propio HTML crea y que no tiene sentido replicar a los demas usuarios.
  var SKIP_SEL = '[data-plan-ignore],.modal,.tooltip,.toast,.popover,[role="dialog"],[role="tooltip"]';

  var TRANSIENT_CLASS = {
    dragging: 1, "drag-over": 1, dragover: 1, "is-dragging": 1, "drop-target": 1,
    "drag-active": 1, "piece-dragging": 1, "sortable-ghost": 1, "sortable-chosen": 1,
    "sortable-drag": 1, "no-transition": 1
  };
  var TRANSIENT_ATTR = { "aria-grabbed": 1, "data-plan-tmp": 1 };
  var EMPTY_STATE = { v: 2, nodes: {} };
  var ROOT_KEY = "#root";

  var baseRoot = null;        // clon del <html> tal como quedo al cargar (sin overlay)
  var baseIdx = null;         // indice del clon: { map, keys }
  var baseShellCache = null;  // key -> shell del clon (la base no cambia en la sesion)
  var revision = Number(CFG.revision) || 0;
  var baseRevision = Number(CFG.baseRevision) || 0;
  var applying = 0;
  var ready = false;
  var lastSentJson = "";
  var saveTimer = null;
  var ackState = EMPTY_STATE;   // ultimo estado que sabemos compartido con el servidor
  var inFlight = false;
  var pendingSave = false;
  var savedOnce = false;
  // Llaves que llegaron por el socket y NO se replicaron en pantalla (ediciones
  // de contenido). No estan en el DOM local, asi que al guardar hay que tomarlas
  // del ultimo estado conocido del servidor en vez de calcularlas del DOM: si no,
  // el guardado propio las borraria.
  var skippedKeys = Object.create(null);

  // ---------------------------------------------------------------- utilidades

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function escAttr(s) {
    return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  }
  function normText(s) {
    return String(s || "").replace(/\s+/g, " ").trim().slice(0, 60);
  }
  function matches(el, sel) {
    try { return !!(el.matches && el.matches(sel)); } catch (e) { return false; }
  }
  function depthOf(el) {
    var d = 0;
    while (el && el.parentNode) { d++; el = el.parentNode; }
    return d;
  }
  function notIn(a, b) {
    var out = [];
    for (var i = 0; i < a.length; i++) if (b.indexOf(a[i]) === -1) out.push(a[i]);
    return out;
  }

  // ------------------------------------------------------------------- llaves

  function colIdOf(el) {
    var explicit = el.getAttribute("data-col-id") || el.getAttribute("data-day");
    if (explicit) return explicit;
    try {
      if (typeof window.getColId === "function") {
        var v = window.getColId(el);
        if (v) return String(v);
      }
    } catch (e) { /* getColId puede depender del documento vivo */ }
    var head = el.querySelector(".cal-col-head, .col-head, header, h1, h2, h3, h4");
    return normText(head ? head.textContent : el.textContent) || null;
  }

  /** Llave estable e independiente de la posicion en el DOM. */
  function explicitKeyOf(el) {
    var dp = el.getAttribute("data-piece");
    if (dp) return "p:" + dp;
    var pk = el.getAttribute("data-plan-key");
    if (pk) return "k:" + pk;
    if (el.id) return "i:" + el.id;
    if (el.classList && el.classList.contains("cal-col")) {
      var cid = colIdOf(el);
      if (cid) return "c:" + cid;
    }
    return null;
  }

  /**
   * Indexa todo el arbol. Los elementos sin llave explicita reciben una llave
   * estructural relativa al ancestro con llave explicita mas cercano, para que
   * mover o insertar una pieza identificada no invalide al resto.
   */
  function buildIndex(root) {
    var map = Object.create(null);
    var keys = new WeakMap();
    var used = Object.create(null);

    function assign(el, k) {
      if (used[k] === undefined) used[k] = 0;
      else { used[k] += 1; k = k + "~" + used[k]; }
      map[k] = el;
      keys.set(el, k);
      return k;
    }

    assign(root, ROOT_KEY);

    (function walk(parent, anchorKey, path) {
      var kids = parent.children;
      for (var i = 0; i < kids.length; i++) {
        var el = kids[i];
        if (matches(el, SKIP_SEL)) continue;
        var ek = explicitKeyOf(el);
        if (ek) {
          walk(el, assign(el, ek), "");
        } else {
          var np = path ? path + "." + i : String(i);
          assign(el, "s:" + anchorKey + "/" + np);
          walk(el, anchorKey, np);
        }
      }
    })(root, ROOT_KEY, "");

    return { map: map, keys: keys };
  }

  // ------------------------------------------------------------- serializacion

  /**
   * "Shell" de un elemento: su contenido con cada hijo-elemento reemplazado por
   * un marcador <x-a k="llave">. Asi un reordenamiento, una pieza movida de
   * dia, un texto editado o un borrado se vuelven un simple cambio de string,
   * sin arrastrar el subarbol completo.
   */
  function shellOf(el, idx, placeholderOk) {
    var out = [];
    var kids = el.childNodes;
    for (var i = 0; i < kids.length; i++) {
      var n = kids[i];
      if (n.nodeType === 3) {
        out.push(esc(n.nodeValue));
      } else if (n.nodeType === 8) {
        out.push("<!--" + String(n.nodeValue).replace(/--/g, "- -") + "-->");
      } else if (n.nodeType === 1) {
        if (matches(n, SKIP_SEL)) continue;
        var k = idx.keys.get(n);
        if (k && (!placeholderOk || placeholderOk(k))) {
          out.push('<x-a k="' + escAttr(k) + '"></x-a>');
        } else {
          out.push(n.outerHTML);
        }
      }
    }
    return out.join("");
  }

  function baseShellOf(key) {
    if (baseShellCache[key] === undefined) {
      var be = baseIdx.map[key];
      baseShellCache[key] = be ? shellOf(be, baseIdx, null) : "";
    }
    return baseShellCache[key];
  }

  function classesOf(el) {
    var out = [];
    var cl = el.classList;
    if (!cl) return out;
    for (var i = 0; i < cl.length; i++) if (!TRANSIENT_CLASS[cl[i]]) out.push(cl[i]);
    return out;
  }

  function attrsOf(el) {
    var o = Object.create(null);
    var a = el.attributes;
    for (var i = 0; i < a.length; i++) {
      var n = a[i].name;
      if (n === "class" || TRANSIENT_ATTR[n]) continue;
      o[n] = a[i].value;
    }
    return o;
  }

  function attrDelta(liveEl, baseEl) {
    var l = attrsOf(liveEl), b = attrsOf(baseEl), d = null;
    for (var k in l) if (b[k] !== l[k]) { d = d || {}; d[k] = l[k]; }
    for (var k2 in b) if (!(k2 in l)) { d = d || {}; d[k2] = null; }
    return d;
  }

  /**
   * Lo que el usuario escribe vive en propiedades del DOM, no en atributos, y
   * no saldria al serializar. Esto lo vuelca a atributos para que el guardado
   * sea literal.
   */
  function normalize(root) {
    var inputs = root.querySelectorAll("input");
    for (var i = 0; i < inputs.length; i++) {
      var el = inputs[i];
      if (el.type === "checkbox" || el.type === "radio") {
        if (el.checked) el.setAttribute("checked", ""); else el.removeAttribute("checked");
      } else if (el.type !== "file" && el.type !== "password") {
        if (el.getAttribute("value") !== el.value) el.setAttribute("value", el.value);
      }
    }
    var tas = root.querySelectorAll("textarea");
    for (var j = 0; j < tas.length; j++) {
      if (tas[j].textContent !== tas[j].value) tas[j].textContent = tas[j].value;
    }
    var sels = root.querySelectorAll("select");
    for (var s = 0; s < sels.length; s++) {
      var opts = sels[s].options;
      for (var o = 0; o < opts.length; o++) {
        if (opts[o].selected) opts[o].setAttribute("selected", ""); else opts[o].removeAttribute("selected");
      }
    }
  }

  // -------------------------------------------------------------------- diff

  function computeState() {
    applying++;
    try { normalize(document.documentElement); } finally { applying--; }

    var live = buildIndex(document.documentElement);
    var bm = baseIdx.map;
    var inBase = function (k) { return !!bm[k]; };
    var nodes = {};

    for (var k in bm) {
      var le = live.map[k];
      if (!le) continue;                 // desaparecio: lo refleja el shell del padre
      var be = bm[k];

      var entry = null;
      if (k !== ROOT_KEY) {
        var add = notIn(classesOf(le), classesOf(be));
        var rm = notIn(classesOf(be), classesOf(le));
        if (add.length) { entry = entry || {}; entry.ca = add; }
        if (rm.length) { entry = entry || {}; entry.cr = rm; }
        var ad = attrDelta(le, be);
        if (ad) { entry = entry || {}; entry.at = ad; }
      }
      if (!matches(le, IGNORE_SEL)) {
        var ls = shellOf(le, live, inBase);
        var bs = baseShellOf(k);
        // bsh es la foto de la base con la que se comparo: sin ella no se
        // podria fusionar este cambio contra un HTML nuevo mas adelante.
        if (ls !== bs) { entry = entry || {}; entry.sh = ls; entry.bsh = bs; }
      }
      if (entry) nodes[k] = entry;
    }
    return { v: 2, nodes: nodes };
  }

  // -------------------------------------------------- merge de 3 vias

  /**
   * Descompone un shell en "items" (hijos-elemento, identificados por llave o
   * por su HTML) y "layout" (el texto suelto y las posiciones de los items).
   */
  function tokenizeShell(html, contextEl) {
    var tmp = contextEl.cloneNode(false);
    tmp.innerHTML = html;
    var items = [], layout = [], seen = {};
    var kids = tmp.childNodes;
    for (var i = 0; i < kids.length; i++) {
      var n = kids[i];
      if (n.nodeType === 1) {
        var id, out;
        if (n.tagName === "X-A") {
          var k = n.getAttribute("k");
          out = '<x-a k="' + escAttr(k) + '"></x-a>';
          id = "ph:" + k;
        } else {
          out = n.outerHTML;
          id = "el:" + out;
        }
        if (seen[id] === undefined) seen[id] = 0;
        else { seen[id] += 1; id = id + "#" + seen[id]; }
        items.push({ id: id, html: out });
        layout.push({ item: true });
      } else if (n.nodeType === 3) {
        layout.push({ text: esc(n.nodeValue) });
      } else if (n.nodeType === 8) {
        layout.push({ text: "<!--" + String(n.nodeValue).replace(/--/g, "- -") + "-->" });
      }
    }
    return { items: items, layout: layout };
  }

  function idsOf(tok) {
    var a = [];
    for (var i = 0; i < tok.items.length; i++) a.push(tok.items[i].id);
    return a;
  }

  function textOf(tok) {
    var s = "";
    for (var i = 0; i < tok.layout.length; i++) if (!tok.layout[i].item) s += tok.layout[i].text;
    return s.replace(/\s+/g, " ").trim();
  }

  /** Merge de listas: base vieja (O), lo que hay en el panel (L), base nueva (N). */
  function merge3(O, L, N) {
    var out = [];
    for (var i = 0; i < N.length; i++) {
      // Lo que el usuario borro no vuelve; lo que no toco se respeta.
      if (O.indexOf(N[i]) !== -1 && L.indexOf(N[i]) === -1) continue;
      out.push(N[i]);
    }
    // Lo que el usuario agrego o movio hasta aca y la base nueva no trae.
    for (var j = 0; j < L.length; j++) {
      var k = L[j];
      if (out.indexOf(k) !== -1) continue;
      if (O.indexOf(k) !== -1 && N.indexOf(k) === -1) continue;  // la base nueva lo elimino
      var anchor = -1;
      for (var b = j - 1; b >= 0; b--) {
        var p = out.indexOf(L[b]);
        if (p !== -1) { anchor = p; break; }
      }
      out.splice(anchor + 1, 0, k);
    }
    // Reordenamientos hechos en el panel sobre elementos que ya existian.
    var slots = [], picked = [];
    for (var s = 0; s < out.length; s++) {
      if (L.indexOf(out[s]) !== -1 && O.indexOf(out[s]) !== -1) { slots.push(s); picked.push(out[s]); }
    }
    picked.sort(function (a, b) { return L.indexOf(a) - L.indexOf(b); });
    for (var t = 0; t < slots.length; t++) out[slots[t]] = picked[t];
    return out;
  }

  function rebuildShell(layout, items) {
    var out = [], idx = 0;
    for (var i = 0; i < layout.length; i++) {
      if (layout[i].item) { if (idx < items.length) out.push(items[idx++].html); }
      else out.push(layout[i].text);
    }
    while (idx < items.length) out.push(items[idx++].html);
    return out.join("");
  }

  /**
   * Reconcilia el contenido de un contenedor cuando la base cambio (se subio un
   * HTML nuevo): conserva lo que el equipo movio, agrego o borro y a la vez deja
   * entrar lo que trae el archivo nuevo.
   */
  function mergeShell(oldSh, liveSh, newSh, contextEl) {
    if (oldSh === newSh) return liveSh;   // la base no cambio aqui
    if (oldSh === liveSh) return newSh;   // el panel no toco esto
    try {
      var O = tokenizeShell(oldSh, contextEl);
      var L = tokenizeShell(liveSh, contextEl);
      var N = tokenizeShell(newSh, contextEl);
      var ids = merge3(idsOf(O), idsOf(L), idsOf(N));
      var byId = {}, src = [N, O, L];
      for (var s = 0; s < src.length; s++) {
        for (var i = 0; i < src[s].items.length; i++) byId[src[s].items[i].id] = src[s].items[i];
      }
      var items = [];
      for (var j = 0; j < ids.length; j++) if (byId[ids[j]]) items.push(byId[ids[j]]);
      // Si el texto suelto se edito en el panel, manda el panel; si no, el archivo nuevo.
      var layout = textOf(O) !== textOf(L) ? L.layout : N.layout;
      return rebuildShell(layout, items);
    } catch (e) {
      return liveSh;
    }
  }

  // ----------------------------------------------------------------- aplicar

  function setClasses(el, target) {
    var keep = [];
    var cl = el.classList;
    if (cl) for (var i = 0; i < cl.length; i++) if (TRANSIENT_CLASS[cl[i]]) keep.push(cl[i]);
    var next = target.concat(keep).join(" ");
    if (el.getAttribute("class") === next) return;
    if (next) el.setAttribute("class", next); else el.removeAttribute("class");
  }

  function setAttrs(el, target) {
    var cur = el.attributes;
    for (var i = cur.length - 1; i >= 0; i--) {
      var n = cur[i].name;
      if (n === "class" || TRANSIENT_ATTR[n]) continue;
      if (!(n in target)) el.removeAttribute(n);
    }
    for (var k in target) if (el.getAttribute(k) !== target[k]) el.setAttribute(k, target[k]);
  }

  function setShell(el, html, live, imported) {
    var inBase = function (k) { return !!baseIdx.map[k]; };
    if (shellOf(el, live, inBase) === html) return;

    // Los overlays efimeros del propio HTML no viajan en el shell: se
    // reenganchan tal cual estaban.
    var keepSkipped = [];
    for (var s = 0; s < el.children.length; s++) {
      if (matches(el.children[s], SKIP_SEL)) keepSkipped.push(el.children[s]);
    }

    var tmp = el.cloneNode(false);   // clon vacio: conserva el contexto de parseo (tbody, tr, ...)
    tmp.innerHTML = html;

    var frag = document.createDocumentFragment();
    while (tmp.firstChild) {
      var n = tmp.firstChild;
      tmp.removeChild(n);
      if (n.nodeType === 1 && n.tagName === "X-A") {
        var k = n.getAttribute("k");
        var target = live.map[k];
        if (!target && baseIdx.map[k]) {
          target = baseIdx.map[k].cloneNode(true);
          live.map[k] = target;
          imported.hit = true;
        }
        if (target) frag.appendChild(target);
      } else {
        frag.appendChild(n);
      }
    }
    while (el.firstChild) el.removeChild(el.firstChild);
    el.appendChild(frag);
    for (var t = 0; t < keepSkipped.length; t++) el.appendChild(keepSkipped[t]);
  }

  function applyEntry(el, key, entry, live, imported) {
    var be = baseIdx.map[key];
    if (!be) return;
    if (key !== ROOT_KEY) {
      var target = classesOf(be);
      if (entry && entry.cr) target = notIn(target, entry.cr);
      if (entry && entry.ca) target = target.concat(notIn(entry.ca, target));
      setClasses(el, target);

      var attrs = attrsOf(be);
      if (entry && entry.at) {
        for (var a in entry.at) {
          if (entry.at[a] === null) delete attrs[a]; else attrs[a] = entry.at[a];
        }
      }
      setAttrs(el, attrs);
    }
    if (matches(el, IGNORE_SEL)) return;

    var curBase = baseShellOf(key);
    var target;
    if (!entry || entry.sh === undefined) target = curBase;
    else if (entry.bsh === undefined || entry.bsh === curBase) target = entry.sh;
    else target = mergeShell(entry.bsh, entry.sh, curBase, el);

    setShell(el, target, live, imported);
  }

  /**
   * Subconjunto del estado que SI se replica en vivo entre navegadores:
   *
   *   - Marcado de piezas: checks individuales y boton "HECHO" por semana.
   *     Ambos son cambios de clase (ca/cr), mas algun atributo (at).
   *   - Movimiento de una tarjeta a otro dia: cambia el shell de la columna
   *     del calendario (.cal-col).
   *
   * Todo lo demas —editar el texto de una pieza, agregarla o borrarla— se
   * sigue guardando igual, pero solo se ve al recargar. Replicarlo en vivo
   * reescribia la pantalla del otro mientras estaba trabajando, que es lo que
   * hacia engorroso que dos personas usaran el panel a la vez.
   *
   * Devuelve full:false cuando quedo algo sin replicar. Eso es importante:
   * en ese caso NO hay que avanzar la revision local, para que el proximo
   * guardado entre por el merge de 3 vias (mergeStates) y no pise el cambio
   * que no aplicamos.
   */
  function liveSubset(nodes) {
    var out = {};
    var full = true;
    var skipped = [];
    var live = buildIndex(document.documentElement);
    for (var k in nodes) {
      var e = nodes[k] || {};
      var keep = null;
      if (e.ca) { keep = keep || {}; keep.ca = e.ca; }
      if (e.cr) { keep = keep || {}; keep.cr = e.cr; }
      if (e.at) { keep = keep || {}; keep.at = e.at; }
      if (e.sh !== undefined) {
        var el = live.map[k] || baseIdx.map[k];
        var esColumna = !!(el && el.classList && el.classList.contains("cal-col"));
        if (esColumna) {
          keep = keep || {};
          keep.sh = e.sh;
          if (e.bsh !== undefined) keep.bsh = e.bsh;
        } else {
          full = false;          // edicion de contenido: no se replica en vivo
          skipped.push(k);       // ...pero hay que conservarla al guardar
        }
      }
      if (keep) out[k] = keep;
    }
    return { nodes: out, full: full, skipped: skipped };
  }

  /**
   * Las etiquetas de la semana ("✓ HECHO", "En desarrollo", "8/10 ✓") las
   * calcula el propio HTML a partir de las piezas marcadas. Tras replicar los
   * marcados se las recalcula localmente, en vez de sincronizar tambien su
   * texto.
   */
  function refreshWeekLabels() {
    try {
      if (typeof window.updateWeekButton === "function") {
        var semanas = document.querySelectorAll(".week-card");
        for (var i = 0; i < semanas.length; i++) window.updateWeekButton(semanas[i]);
      }
      if (typeof window.updateEmailWeekButton === "function") {
        var emails = document.querySelectorAll(".em-week");
        for (var j = 0; j < emails.length; j++) window.updateEmailWeekButton(emails[j]);
      }
    } catch (e) {}
  }

  function applyState(state, noRevert) {
    if (!baseIdx) return;
    var nodes = (state && state.nodes) || {};
    applying++;
    try {
      // Todo lo que hoy difiere de la base y no aparece en el estado entrante
      // debe volver a la base: asi el panel converge exactamente al estado recibido.
      //
      // noRevert se usa en la replicacion en vivo: ahi solo llega un subconjunto
      // del estado (marcados y movimientos), asi que revertir lo que "falta"
      // borraria el trabajo local del usuario.
      var toRevert = [];
      if (!noRevert) {
        try {
          var localNodes = computeState().nodes;
          for (var lk in localNodes) if (!nodes[lk]) toRevert.push(lk);
        } catch (e0) { /* si el diff falla, al menos aplicamos lo entrante */ }
      }

      for (var pass = 0; pass < 2; pass++) {
        var live = buildIndex(document.documentElement);
        var imported = { hit: false };

        if (pass === 0) {
          for (var r = 0; r < toRevert.length; r++) {
            var rel = live.map[toRevert[r]];
            if (rel && baseIdx.map[toRevert[r]]) applyEntry(rel, toRevert[r], null, live, imported);
          }
        }

        var keys = Object.keys(nodes);
        keys.sort(function (a, b) {
          return depthOf(live.map[a] || baseIdx.map[a]) - depthOf(live.map[b] || baseIdx.map[b]);
        });
        for (var i = 0; i < keys.length; i++) {
          var el = live.map[keys[i]];
          if (el) applyEntry(el, keys[i], nodes[keys[i]], live, imported);
        }
        if (!imported.hit) break;   // segunda pasada solo si hubo nodos re-creados
      }
    } catch (e) {
      try { console.error("[plan] applyState:", e); } catch (e2) {}
    } finally {
      applying--;
    }
    try { if (typeof window.initDragAndDrop === "function") window.initDragAndDrop(); } catch (e3) {}
    try { document.dispatchEvent(new CustomEvent("supricom:plan-applied")); } catch (e4) {}
  }

  /**
   * Merge de overlays cuando dos personas guardaron a la vez: se compara cada
   * pieza contra el ultimo estado comun. Si solo uno la toco, gana ese; si
   * ambos tocaron la misma pieza, gana el que guarda ahora. Asi dos usuarios
   * trabajando en piezas distintas nunca se borran el trabajo.
   */
  function mergeStates(base, mine, theirs) {
    var b = (base && base.nodes) || {};
    var m = (mine && mine.nodes) || {};
    var t = (theirs && theirs.nodes) || {};
    var keys = {}, k;
    for (k in b) keys[k] = 1;
    for (k in m) keys[k] = 1;
    for (k in t) keys[k] = 1;

    var out = {};
    for (k in keys) {
      var bs = JSON.stringify(b[k] || null);
      var ms = JSON.stringify(m[k] || null);
      var pick = ms !== bs ? m[k] : (JSON.stringify(t[k] || null) !== bs ? t[k] : m[k]);
      if (pick) out[k] = pick;
    }
    return { v: 2, nodes: out };
  }

  // ---------------------------------------------------------------- snapshot

  function snapshotHtml() {
    applying++;
    try { normalize(document.documentElement); } finally { applying--; }
    var doc = document.documentElement.cloneNode(true);
    var junk = doc.querySelectorAll("[data-plan-ignore],x-a");
    for (var i = 0; i < junk.length; i++) junk[i].parentNode.removeChild(junk[i]);
    if (doc.getAttribute("style") === "") doc.removeAttribute("style");
    return "<!DOCTYPE html>\n" + doc.outerHTML;
  }

  // ------------------------------------------------------------------ guardar

  function status(s) {
    try {
      if (window.parent !== window) {
        parent.postMessage({ type: "SUPRICOM_PLAN_STATUS", status: s, revision: revision }, "*");
      }
    } catch (e) {}
  }

  function scheduleSave() {
    if (!ready || !CAN_EDIT) return;
    clearTimeout(saveTimer);
    status("pending");
    saveTimer = setTimeout(function () { doSave(false); }, 700);
  }

  function doSave(force, retry) {
    if (!ready || !CAN_EDIT) return;
    clearTimeout(saveTimer);
    if (inFlight) { pendingSave = true; return; }

    var state;
    try { state = computeState(); } catch (e) { status("error"); return; }

    // Lo que llego por el socket y no se replico en pantalla no esta en el DOM,
    // asi que computeState() no lo ve y guardarlo tal cual lo borraria. Para
    // esas llaves se conserva lo que tiene el servidor.
    try {
      var ackNodes = (ackState && ackState.nodes) || {};
      for (var sk in skippedKeys) {
        if (ackNodes[sk]) state.nodes[sk] = ackNodes[sk];
        else delete state.nodes[sk];
      }
    } catch (eSk) {}

    var json = JSON.stringify(state);
    if (json === lastSentJson && !force) { status("saved"); return; }
    lastSentJson = json;
    status("saving");
    inFlight = true;

    fetch(API + "/state" + VIEW_QS, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        clientId: CLIENT_ID,
        baseRevision: baseRevision,
        revision: revision,
        state: state,
        snapshot: snapshotHtml()
      })
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        inFlight = false;
        if (d && d.stale) { location.reload(); return; }

        // Alguien guardo entre medio: fusionamos su version con la nuestra y
        // reintentamos, en vez de pisarle el trabajo.
        if (d && d.conflict) {
          revision = Number(d.revision) || revision;
          var merged = mergeStates(ackState, state, d.state || EMPTY_STATE);
          ackState = merged;
          lastSentJson = "";
          applyState(merged);
          if (!retry) { doSave(true, true); }
          else { status("error"); }
          return;
        }

        if (d && d.success) {
          revision = Number(d.revision) || revision;
          ackState = state;
          savedOnce = true;
          status("saved");
          if (pendingSave) { pendingSave = false; setTimeout(function () { doSave(false); }, 50); }
        } else {
          lastSentJson = "";
          status("error");
        }
      })
      .catch(function () {
        inFlight = false;
        lastSentJson = "";
        status("error");
      });
  }

  /** Al cerrar u ocultar la pestana: envio sin snapshot (liviano, keepalive). */
  function flush() {
    if (!ready || !CAN_EDIT) return;
    var state;
    try { state = computeState(); } catch (e) { return; }
    var json = JSON.stringify(state);
    if (json === lastSentJson) return;
    lastSentJson = json;
    try {
      fetch(API + "/state" + VIEW_QS, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        keepalive: true,
        body: JSON.stringify({
          clientId: CLIENT_ID, baseRevision: baseRevision, revision: revision, state: state
        })
      }).catch(function () {});
    } catch (e) {}
  }

  // --------------------------------------------------------- formato antiguo

  function byDataPiece(dp) {
    var all = document.querySelectorAll("[data-piece]");
    for (var i = 0; i < all.length; i++) if (all[i].getAttribute("data-piece") === dp) return all[i];
    return null;
  }

  /** Migra el formato viejo (checks posicionales + move|) al overlay nuevo. */
  function applyLegacy(legacy) {
    var pieces = Array.prototype.slice.call(document.querySelectorAll(".piece"));
    var emails = Array.prototype.slice.call(document.querySelectorAll(".email-card"));

    function positional(list, sel, key) {
      var parts = String(key).split("|");
      if (parts.length !== 2) return null;
      var idx = parseInt(parts[1], 10);
      if (isNaN(idx)) return null;
      if (parts[0] === "g") return list[idx] || null;
      var anc = document.getElementById(parts[0]);
      return anc ? anc.querySelectorAll(sel)[idx] || null : null;
    }

    applying++;
    try {
      Object.keys(legacy).forEach(function (key) {
        if (key.indexOf("move|") === 0) {
          var piece = byDataPiece(key.slice(5));
          var dest = legacy[key];
          if (!piece || !dest) return;
          var cols = document.querySelectorAll(".cal-col");
          for (var i = 0; i < cols.length; i++) {
            if (colIdOf(cols[i]) === dest) { cols[i].appendChild(piece); break; }
          }
          return;
        }
        if (!legacy[key]) return;
        var el = key.indexOf("dp|") === 0
          ? byDataPiece(key.slice(3))
          : positional(pieces, ".piece", key) || positional(emails, ".email-card", key);
        if (el) el.classList.add("checked");
      });
    } catch (e) {
      try { console.error("[plan] legacy:", e); } catch (e2) {}
    } finally {
      applying--;
    }
  }

  // -------------------------------------------------------------------- socket

  function connectSocket() {
    var origin = location.origin && location.origin !== "null" ? location.origin : "";
    var url = (SOCKET_URL || origin).replace(/\/+$/, "");
    if (!url) return;
    var s = document.createElement("script");
    s.src = url + "/socket.io/socket.io.js";
    s.setAttribute("data-plan-ignore", "");
    s.onload = function () {
      try {
        var socket = window.io(url, { transports: ["websocket", "polling"] });
        socket.on("vista-state-updated", function (p) {
          if (!p || p.clientId === CLIENT_ID) return;
          // El broadcast es global: hay que descartar lo que pertenece a otra
          // vista, o la sandbox y el plan real se pisan entre si.
          if (p.view && p.view !== MY_VIEW) return;
          if (Number(p.baseRevision) !== baseRevision) { location.reload(); return; }
          var incoming = p.state || EMPTY_STATE;

          // La replicacion selectiva esta EN PRUEBAS y solo se activa en la
          // vista sandbox. En el plan real se sigue aplicando el estado
          // completo, que es el comportamiento probado: una version anterior de
          // esto degradaba los marcados cuando habia dos paneles abiertos.
          if (!LIVE_SELECTIVO) {
            revision = Number(p.revision) || revision;
            ackState = incoming;
            lastSentJson = JSON.stringify(incoming);
            applyState(incoming);
            return;
          }

          // Solo se replican marcados y movimientos entre dias; el resto se ve
          // al recargar (ver liveSubset).
          var sub = liveSubset((incoming && incoming.nodes) || {});
          applyState({ v: 2, nodes: sub.nodes }, true);
          refreshWeekLabels();

          // Las ediciones que no se replicaron quedan anotadas: no estan en el
          // DOM local, asi que al guardar se toman de ackState (ver doSave).
          for (var si = 0; si < sub.skipped.length; si++) skippedKeys[sub.skipped[si]] = 1;

          // La revision se avanza SIEMPRE, aunque no se haya replicado todo.
          // Una version anterior no lo hacia, para forzar el merge de 3 vias, y
          // eso dejaba a los dos navegadores en conflicto permanente: cada
          // guardado chocaba con el del otro y entraban en un bucle que termino
          // degradando el estado. Lo que no se replica se conserva via
          // skippedKeys, que es mas barato y no depende del conflicto.
          revision = Number(p.revision) || revision;
          ackState = incoming;
          lastSentJson = JSON.stringify(incoming);
        });
        socket.on("vista-html-updated", function (p) {
          if (p && p.view && p.view !== MY_VIEW) return;
          location.reload();
        });
      } catch (e) {}
    };
    document.head.appendChild(s);
  }

  // ---------------------------------------------------------------------- boot

  /** Los nodos de servicio del runtime (config, socket.io) no son un cambio. */
  function onlyOwnNodes(records) {
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (r.target && r.target.nodeType === 1 && matches(r.target, "[data-plan-ignore]")) continue;
      var added = r.addedNodes || [];
      var removed = r.removedNodes || [];
      if (!added.length && !removed.length) return false;
      var own = true;
      for (var a = 0; a < added.length; a++) {
        if (added[a].nodeType !== 1 || !matches(added[a], "[data-plan-ignore]")) { own = false; break; }
      }
      for (var b = 0; own && b < removed.length; b++) {
        if (removed[b].nodeType !== 1 || !matches(removed[b], "[data-plan-ignore]")) { own = false; break; }
      }
      if (!own) return false;
    }
    return true;
  }

  function startObserving() {
    new MutationObserver(function (records) {
      if (applying > 0) return;
      if (onlyOwnNodes(records)) return;
      scheduleSave();
    }).observe(document.documentElement, {
      subtree: true, childList: true, attributes: true, characterData: true
    });
    document.addEventListener("input", scheduleSave, true);
    document.addEventListener("change", scheduleSave, true);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") flush();
    });
  }

  function reveal() {
    try {
      document.documentElement.style.visibility = "";
      if (document.documentElement.getAttribute("style") === "") {
        document.documentElement.removeAttribute("style");
      }
    } catch (e) {}
  }

  function finishBoot(needsSave, merged) {
    reveal();
    ready = true;
    startObserving();
    connectSocket();
    status(needsSave ? "pending" : "saved");
    // Al re-materializar despues de una subida, varios navegadores pueden
    // llegar a la vez: el desfase evita una rafaga de escrituras identicas.
    //
    // Solo se fuerza la escritura cuando hubo un merge real (base nueva o
    // migracion del formato viejo). Si lo unico "no fresco" era el snapshot,
    // se guarda sin forzar: doSave descarta la escritura cuando el estado es
    // identico al ya almacenado, en vez de crear una revision vacia por cada
    // visita al panel.
    if (needsSave) {
      setTimeout(function () {
        if (!savedOnce) doSave(!!merged);
      }, 250 + Math.floor(Math.random() * 500));
    }
  }

  function boot() {
    try {
      applying++;
      normalize(document.documentElement);
      baseRoot = document.documentElement.cloneNode(true);
      var junk = baseRoot.querySelectorAll("[data-plan-ignore]");
      for (var i = 0; i < junk.length; i++) junk[i].parentNode.removeChild(junk[i]);
      baseIdx = buildIndex(baseRoot);
      baseShellCache = Object.create(null);
      applying--;
    } catch (e) {
      applying = 0;
      reveal();
      try { console.error("[plan] boot:", e); } catch (e2) {}
      return;
    }

    fetch(API + "/state" + VIEW_QS, { credentials: "same-origin" })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        d = d || {};
        revision = Number(d.revision) || 0;
        var hasState = d.state && d.state.nodes && Object.keys(d.state.nodes).length;
        var needsSave = !d.snapshotFresh;
        // Distinto de needsSave: aqui si hubo un merge real que hay que
        // persistir si o si. Un snapshot desactualizado, en cambio, no
        // justifica forzar una escritura: si el estado es identico al del
        // servidor, forzarla crea una revision nueva sin ningun cambio y el
        // contador sube solo con que alguien abra el panel.
        var merged = false;

        if (hasState) {
          ackState = d.state;
          lastSentJson = JSON.stringify(d.state);
          applyState(d.state);
          // Si la base cambio (se subio un HTML nuevo), lo que acabamos de
          // aplicar es el merge: hay que persistirlo sobre la base nueva.
          if (Number(d.baseRevision) !== baseRevision) {
            needsSave = true;
            merged = true;
          }
        } else if (d.legacy && Object.keys(d.legacy).length) {
          applyLegacy(d.legacy);
          needsSave = true;
          merged = true;
        }
        finishBoot(!!needsSave, merged);
      })
      .catch(function () { finishBoot(false); });
  }

  window.addEventListener("message", function (e) {
    if (!e.data) return;
    if (e.data.type === "SUPRICOM_PLAN_RELOAD") location.reload();
    if (e.data.type === "SUPRICOM_PLAN_SAVE_NOW") doSave(true);
  });

  window.__planForceSave = function () { doSave(true); };
  window.__planSnapshot = function () { return snapshotHtml(); };

  if (document.readyState === "complete") setTimeout(boot, 60);
  else window.addEventListener("load", function () { setTimeout(boot, 60); });
})();
`;

export function buildInjection(opts: {
  api: string;
  socketUrl: string;
  baseRevision: number;
  revision: number;
  canEdit: boolean;
  /** Vista sobre la que trabaja este panel (produccion o sandbox de pruebas). */
  view?: string;
}) {
  const cfg = JSON.stringify({
    api: opts.api,
    socketUrl: opts.socketUrl,
    baseRevision: opts.baseRevision,
    revision: opts.revision,
    canEdit: opts.canEdit,
    view: opts.view || null,
  }).replace(/</g, "\\u003c");

  // El documento arranca oculto para que no se vea el salto entre el HTML base
  // y el HTML ya con los cambios aplicados. El timeout es la red de seguridad
  // por si el runtime falla.
  return (
    `<script id="__plan_cfg" data-plan-ignore>window.__PLAN_CFG__=${cfg};` +
    `document.documentElement.style.visibility="hidden";` +
    `setTimeout(function(){document.documentElement.style.visibility="";},5000);</script>` +
    `<script id="__plan_rt" data-plan-ignore>${PLAN_RUNTIME_JS}</script>`
  );
}
