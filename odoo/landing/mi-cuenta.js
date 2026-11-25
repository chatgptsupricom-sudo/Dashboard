/* SUPRICOM: «Mi cuenta» (mi-cuenta.html). Entrar con correo y contraseña, crear o recuperar la contraseña
   con un código que llega al correo, y con la sesión: resumen, pedidos (con su detalle y «Repetir») y
   facturas con el estado de cuenta. Todo lo lee de la API del panel (app/api/tienda-web/clientes/*) con
   el token en `Authorization`; no hay cookies. Lo que se muestra se escribe siempre como texto. */
(() => {
    "use strict";
    const P = window.SUPRICOM_PAGINA;
    if (!P) return;
    const T = window.SUPRICOM;
    const $ = (s, el = document) => el.querySelector(s);
    const $$ = (s, el = document) => [...el.querySelectorAll(s)];
    const crear = P.crear;

    const pedida = new URLSearchParams(location.search).get("api");
    const api = (pedida === "no" ? "" : pedida || T.api || "").replace(/\/+$/, "");
    const CLAVE = "supricom-cliente-token";
    const leerToken = () => { try { return localStorage.getItem(CLAVE) || sessionStorage.getItem(CLAVE) || ""; } catch (e) { return ""; } };
    const guardarToken = (t, recordar) => {
        try {
            localStorage.removeItem(CLAVE); sessionStorage.removeItem(CLAVE);
            (recordar ? localStorage : sessionStorage).setItem(CLAVE, t);
        } catch (e) { /* sin almacenamiento: la sesión dura lo que la página */ }
        tokenEnMemoria = t;
    };
    let tokenEnMemoria = leerToken();
    const borrarToken = () => { tokenEnMemoria = ""; try { localStorage.removeItem(CLAVE); sessionStorage.removeItem(CLAVE); } catch (e) { /* */ } };

    /* ---------------------------------------------------------------- Formatos */
    const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
    const fecha = (f) => (f && /^\d{4}-\d{2}-\d{2}/.test(f) ? `${Number(f.slice(8, 10))} ${MESES[Number(f.slice(5, 7)) - 1]} ${f.slice(0, 4)}` : "—");
    const dinero = (n, moneda = "USD") => {
        const codigo = /^[A-Z]{3}$/.test(moneda) ? (moneda === "VEF" ? "VES" : moneda) : "USD";
        try { return new Intl.NumberFormat("es-VE", { style: "currency", currency: codigo, currencyDisplay: "narrowSymbol", minimumFractionDigits: 2 }).format(Number(n) || 0); } catch (e) { return `${(Number(n) || 0).toFixed(2)} ${moneda}`; }
    };
    const cantidad = (n) => (Number(n) || 0).toLocaleString("es-VE", { maximumFractionDigits: 2 });
    const iniciales = (t) => String(t || "").trim().split(/\s+/).slice(0, 2).map((p) => p.charAt(0)).join("").toUpperCase() || "S";

    /* ---------------------------------------------------------------- Llamadas a la API */
    const llamar = async (ruta, { metodo = "GET", cuerpo, sesion = true } = {}) => {
        if (!api) return { ok: false, status: 0, datos: { error: "La cuenta no está disponible en este momento." } };
        const headers = {};
        if (cuerpo) headers["Content-Type"] = "application/json";
        if (sesion && tokenEnMemoria) headers.Authorization = `Bearer ${tokenEnMemoria}`;
        try {
            const r = await fetch(`${api}/clientes/${ruta}`, { method: metodo, headers, body: cuerpo ? JSON.stringify(cuerpo) : undefined, credentials: "omit" });
            const datos = await r.json().catch(() => ({}));
            if (r.status === 401 && sesion) { borrarToken(); mostrarAcceso(datos.error || "Tu sesión terminó. Vuelve a entrar."); }
            return { ok: r.ok, status: r.status, datos };
        } catch (e) {
            return { ok: false, status: 0, datos: { error: "No pudimos conectar. Revisa tu conexión e intenta de nuevo." } };
        }
    };

    /* ---------------------------------------------------------------- Acceso */
    const acceso = $(".acceso");
    const panel = $(".panel-cliente");
    const pasos = $$(".acceso-paso");
    let modo = "crear";
    let correoCodigo = "";
    const irPaso = (nombre, enfocar = true) => {
        for (const p of pasos) p.hidden = p.dataset.paso !== nombre;
        const p = pasos.find((x) => x.dataset.paso === nombre);
        for (const f of $$(".cuenta-fallo", p)) f.hidden = true;
        if (enfocar) $("input:not([type=checkbox])", p)?.focus();
    };
    const fallo = (form, texto) => { const f = $(".cuenta-fallo", form); f.textContent = texto; f.hidden = !texto; };
    const ocupado = (form, si, texto) => {
        const b = $(".cuenta-boton", form);
        b.disabled = si;
        b.classList.toggle("enviando", si);
        if (texto) $(".cuenta-boton-texto", b).textContent = texto;
    };
    for (const b of $$("[data-a-paso]")) {
        b.addEventListener("click", () => {
            if (b.dataset.modo) {
                modo = b.dataset.modo;
                $(".acceso-codigo-titulo").textContent = modo === "recuperar" ? "Recupera tu contraseña" : "Crea tu contraseña";
            }
            const correo = $("#a-correo").value.trim();
            if (b.dataset.aPaso === "codigo" && correo && !$("#c-correo2").value) $("#c-correo2").value = correo;
            irPaso(b.dataset.aPaso);
        });
    }
    // Mostrar u ocultar la contraseña.
    for (const b of $$(".clave-ver")) {
        b.addEventListener("click", () => {
            const campo = b.previousElementSibling;
            const ver = campo.type === "password";
            campo.type = ver ? "text" : "password";
            b.setAttribute("aria-pressed", String(ver));
            b.textContent = ver ? "Ocultar" : "Mostrar";
            b.setAttribute("aria-label", ver ? "Ocultar la contraseña" : "Mostrar la contraseña");
            campo.focus();
        });
    }
    // Reglas de la contraseña nueva, en vivo.
    const reglas = (v) => ({ largo: v.length >= 8, mezcla: /[a-zA-ZáéíóúñÁÉÍÓÚÑ]/.test(v) && /\d/.test(v) });
    $("#c-clave").addEventListener("input", (ev) => {
        const r = reglas(ev.target.value);
        for (const li of $$("#reglas-clave li")) li.classList.toggle("cumple", r[li.dataset.regla]);
    });
    // El código solo admite números (y si se pega con espacios, se limpian).
    $("#c-codigo").addEventListener("input", (ev) => { ev.target.value = ev.target.value.replace(/\D/g, "").slice(0, 6); });

    const entrarCon = (token, recordar) => {
        guardarToken(token, recordar);
        for (const a of $$("[data-cuenta-entrar]")) a.textContent = "Mi cuenta";
        for (const a of $$(".cabecera-cta")) a.hidden = true; // ya es cliente: no se le ofrece pedir cuenta
        mostrarPanel();
    };

    // Entrar
    const formEntrar = $('[data-paso="entrar"]');
    formEntrar.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const correo = $("#a-correo").value.trim();
        const clave = $("#a-clave").value;
        if (!correo || !clave) { fallo(formEntrar, "Escribe tu correo y tu contraseña."); return; }
        fallo(formEntrar, "");
        ocupado(formEntrar, true, "Entrando…");
        const r = await llamar("entrar", { metodo: "POST", cuerpo: { correo, clave, recordar: formEntrar.recordar.checked }, sesion: false });
        ocupado(formEntrar, false, "Entrar");
        if (r.ok && r.datos.token) { $("#a-clave").value = ""; entrarCon(r.datos.token, formEntrar.recordar.checked); return; }
        fallo(formEntrar, r.datos.error || "No pudimos iniciar tu sesión.");
    });

    // Pedir el código
    const formCodigo = $('[data-paso="codigo"]');
    const formClave = $('[data-paso="clave"]');
    const reenviar = $(".acceso-reenviar");
    let relojReenvio = 0;
    const esperarReenvio = (segundos) => {
        clearInterval(relojReenvio);
        let s = segundos;
        reenviar.disabled = true;
        const pintar = () => { reenviar.textContent = s > 0 ? `Reenviar el código (${s} s)` : "Reenviar el código"; reenviar.disabled = s > 0; };
        pintar();
        relojReenvio = setInterval(() => { s -= 1; pintar(); if (s <= 0) clearInterval(relojReenvio); }, 1000);
    };
    const pedirCodigo = async (form) => {
        const r = await llamar("codigo", { metodo: "POST", cuerpo: { correo: correoCodigo }, sesion: false });
        if (!r.ok) { fallo(form, r.datos.error || "No pudimos enviar el código."); return false; }
        $(".acceso-enviado").replaceChildren("Si ", crear("strong", { text: correoCodigo }), " está en la ficha de un cliente, te llegó un código de 6 números. Vence en 15 minutos.");
        esperarReenvio(60);
        return true;
    };
    formCodigo.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const correo = $("#c-correo2").value.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(correo)) { fallo(formCodigo, "Escribe un correo válido."); return; }
        correoCodigo = correo;
        fallo(formCodigo, "");
        ocupado(formCodigo, true, "Enviando…");
        const bien = await pedirCodigo(formCodigo);
        ocupado(formCodigo, false, "Enviar código");
        if (bien) { irPaso("clave"); }
    });
    reenviar.addEventListener("click", async () => { fallo(formClave, ""); await pedirCodigo(formClave); });

    // Código + contraseña nueva
    formClave.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const codigo = $("#c-codigo").value.trim();
        const clave = $("#c-clave").value;
        const r0 = reglas(clave);
        if (!/^\d{6}$/.test(codigo)) { fallo(formClave, "El código tiene 6 números."); $("#c-codigo").focus(); return; }
        if (!r0.largo || !r0.mezcla) { fallo(formClave, "La contraseña necesita al menos 8 caracteres, con letras y números."); $("#c-clave").focus(); return; }
        fallo(formClave, "");
        ocupado(formClave, true, "Guardando…");
        const r = await llamar("clave", { metodo: "POST", cuerpo: { correo: correoCodigo, codigo, clave, recordar: formClave.recordar.checked }, sesion: false });
        ocupado(formClave, false, "Guardar y entrar");
        if (r.ok && r.datos.token) { $("#c-clave").value = ""; $("#c-codigo").value = ""; entrarCon(r.datos.token, formClave.recordar.checked); return; }
        fallo(formClave, r.datos.error || "No pudimos guardar tu contraseña.");
    });

    function mostrarAcceso(aviso) {
        cerrarDetalle(false);
        panel.hidden = true;
        acceso.hidden = false;
        for (const a of $$("[data-cuenta-entrar]")) a.textContent = "Entrar";
        for (const a of $$(".cabecera-cta")) a.hidden = false;
        irPaso("entrar", false);
        if (aviso) fallo(formEntrar, aviso);
        document.title = "Mi cuenta · SUPRICOM";
    }

    /* ---------------------------------------------------------------- Panel */
    const SEDES = Object.entries(T.sedes).map(([id, s]) => ({ id, nombre: s.nombre }));
    for (const sel of [$("#f-pedido-sede"), $("#f-factura-sede")]) for (const s of SEDES) sel.append(crear("option", { value: s.id, text: s.nombre }));
    const aviso = $(".panel-aviso");
    const avisar = (t) => { aviso.textContent = t || ""; aviso.hidden = !t; };

    const insignia = (clase, texto) => crear("span", { class: `insignia insignia-${clase}`, text: texto });
    const esqueletoFilas = (n) => Array.from({ length: n }, () => crear("div", { class: "fila fila-esqueleto", "aria-hidden": "true" }, [
        crear("span", { class: "esqueleto esq-linea media" }), crear("span", { class: "esqueleto esq-linea corta" }),
    ]));

    // Una fila de la tabla de pedidos: toda la fila abre el detalle. Cada dato en su columna; en el teléfono
    // las columnas se acomodan como una tarjeta (mi-cuenta.css).
    const celda = (clase, hijos) => crear("span", { class: `celda ${clase}`, role: "cell" }, hijos);
    const filaPedido = (p) => {
        const b = crear("button", { type: "button", class: "fila fila-pedido", role: "row", "aria-label": `Pedido ${p.numero} del ${fecha(p.fecha)}, ${p.sede.nombre}, ${p.etapaNombre}, ${dinero(p.total, p.moneda)}. Ver el detalle` }, [
            celda("c-numero", [crear("strong", { text: p.numero }), ...(p.referencia ? [crear("small", { text: `Ref. ${p.referencia}` })] : [])]),
            celda("c-fecha", [fecha(p.fecha)]),
            celda("c-sede", [p.sede.nombre]),
            celda("c-estado", [insignia(p.etapa, p.etapaNombre)]),
            celda("c-monto", [dinero(p.total, p.moneda)]),
            crear("span", { class: "celda c-ir", "aria-hidden": "true" }, [P.icono("ir", "icono-ir")]),
        ]);
        b.addEventListener("click", () => abrirDetalle(p.id, b));
        return b;
    };
    const filaFactura = (f) => crear("div", { class: "fila fila-factura", role: "row" }, [
        celda("c-numero", [crear("strong", { text: f.numero }), crear("small", { text: [f.sede.nombre, f.pedido ? `Pedido ${f.pedido}` : ""].filter(Boolean).join(" · ") })]),
        celda("c-fecha", [fecha(f.fecha)]),
        celda("c-vence", [f.estado === "nota" || !f.vence ? "—" : fecha(f.vence)]),
        celda("c-estado", [insignia(f.estado, f.estado === "vencida" && f.atraso ? `Vencida · ${f.atraso} ${f.atraso === 1 ? "día" : "días"}` : f.estadoNombre)]),
        celda("c-monto", [dinero(f.total)]),
        celda(`c-saldo${f.saldo > 0.009 ? " con-saldo" : ""}`, [f.saldo > 0.009 ? dinero(f.saldo) : "—"]),
    ]);

    const tarjetasCuenta = (estado, pedidosAbiertos) => {
        const tarjetas = [];
        const deudas = (estado || []).filter((s) => Math.abs(s.saldo) >= 0.01);
        if (!deudas.length) {
            tarjetas.push(crear("div", { class: "tarjeta-resumen tarjeta-ok" }, [
                crear("p", { class: "tarjeta-titulo", text: "Estado de cuenta" }),
                crear("p", { class: "tarjeta-cifra", text: "Al día" }),
                crear("p", { class: "tarjeta-nota", text: "No tienes facturas por pagar." }),
            ]));
        }
        for (const s of deudas) {
            tarjetas.push(crear("div", { class: `tarjeta-resumen${s.vencido > 0.009 ? " tarjeta-alerta" : ""}` }, [
                crear("p", { class: "tarjeta-titulo", text: `Debes en ${s.sede.nombre}` }),
                crear("p", { class: "tarjeta-cifra", text: dinero(s.saldo) }),
                crear("p", { class: "tarjeta-nota", text: s.vencido > 0.009
                    ? `${dinero(s.vencido)} vencido · la más vieja, hace ${s.masVieja} ${s.masVieja === 1 ? "día" : "días"}`
                    : `${s.facturasAbiertas} ${s.facturasAbiertas === 1 ? "factura abierta" : "facturas abiertas"}, nada vencido` }),
            ]));
        }
        if (pedidosAbiertos !== undefined) {
            const t = crear("button", { type: "button", class: "tarjeta-resumen tarjeta-boton" }, [
                crear("p", { class: "tarjeta-titulo", text: "Pedidos en curso" }),
                crear("p", { class: "tarjeta-cifra", text: String(pedidosAbiertos) }),
                crear("p", { class: "tarjeta-nota", text: pedidosAbiertos ? "Confirmados y todavía sin facturar completos" : "No tienes pedidos en curso" }),
            ]);
            t.addEventListener("click", () => { $("#f-pedido-etapa").value = "abiertos"; irVista("pedidos"); });
            tarjetas.push(t);
        }
        return tarjetas;
    };

    // Resumen
    let datosYo = null;
    const cargarResumen = async () => {
        $(".tarjetas-resumen").replaceChildren(...Array.from({ length: 3 }, () => crear("div", { class: "tarjeta-resumen esqueleto", "aria-hidden": "true" })));
        $(".resumen-pedidos").replaceChildren(...esqueletoFilas(4));
        const r = await llamar("yo");
        if (!r.ok) { if (r.status !== 401) avisar(r.datos.error || "No pudimos leer tu cuenta."); return; }
        avisar("");
        datosYo = r.datos;
        const c = r.datos.cliente || {};
        const nombre = (c.nombre || "").split(/\s+/)[0] || "";
        $(".panel-avatar").textContent = iniciales(c.empresa || c.nombre);
        $(".panel-empresa").textContent = c.empresa || "";
        $(".panel-saludo").textContent = nombre ? `Hola, ${nombre.charAt(0)}${nombre.slice(1).toLowerCase()}` : "Hola";
        $(".panel-datos").replaceChildren(...[c.documento, c.correo].filter(Boolean).map((t) => crear("span", { text: t })));
        $(".resumen-nota").textContent = `Esto es lo que pasa en la cuenta de ${c.empresa || "tu empresa"}: lo que debes, tus pedidos en curso y lo último que pediste.`;
        document.title = `Mi cuenta · ${c.empresa || "SUPRICOM"}`;
        $(".tarjetas-resumen").replaceChildren(...tarjetasCuenta(r.datos.estadoDeCuenta, r.datos.pedidosAbiertos));
        const ult = r.datos.ultimosPedidos || [];
        $(".resumen-pedidos").replaceChildren(...(ult.length ? ult.map(filaPedido) : [crear("p", { class: "lista-vacia", text: "Todavía no tienes pedidos con nosotros." })]));
    };

    // Listas con filtros y páginas
    const estadoLista = { pedidos: { pagina: 1 }, facturas: { pagina: 1 } };
    const paginas = (tipo, total, pagina, porPagina) => {
        const cont = $(`[data-paginas="${tipo}"]`);
        const n = Math.ceil(total / porPagina);
        if (n <= 1) { cont.replaceChildren(); return; }
        const boton = (texto, p, actual = false) => {
            const b = crear("button", { type: "button", class: "pagina", text: texto, disabled: p < 1 || p > n || actual });
            if (actual) b.setAttribute("aria-current", "page");
            b.addEventListener("click", () => { estadoLista[tipo].pagina = p; cargarLista(tipo, true); });
            return b;
        };
        const nums = [...new Set([1, pagina - 1, pagina, pagina + 1, n])].filter((p) => p >= 1 && p <= n).sort((a, b) => a - b);
        const partes = [boton("Anterior", pagina - 1)];
        nums.forEach((p, i) => { if (i && p - nums[i - 1] > 1) partes.push(crear("span", { class: "pagina-salto", text: "…" })); partes.push(boton(String(p), p, p === pagina)); });
        partes.push(boton("Siguiente", pagina + 1));
        cont.replaceChildren(...partes);
    };
    let pedidoLista = 0;
    const cargarLista = async (tipo, subir = false) => {
        const form = $(`[data-filtros="${tipo}"]`);
        const vista = $(`#vista-${tipo}`);
        const lista = $(tipo === "pedidos" ? ".pedidos-lista" : ".facturas-lista");
        const conteo = $(".panel-conteo", vista);
        const q = new URLSearchParams();
        for (const [k, v] of new FormData(form)) if (String(v).trim()) q.set(k, String(v).trim());
        q.set("pagina", String(estadoLista[tipo].pagina));
        const mio = ++pedidoLista;
        lista.setAttribute("aria-busy", "true");
        lista.replaceChildren(...esqueletoFilas(6));
        if (tipo === "facturas") $(".facturas-cuenta").replaceChildren(...Array.from({ length: 2 }, () => crear("div", { class: "tarjeta-resumen esqueleto", "aria-hidden": "true" })));
        const r = await llamar(`${tipo}?${q}`);
        if (mio !== pedidoLista) return; // llegó otra búsqueda después
        lista.removeAttribute("aria-busy");
        if (!r.ok) { if (r.status !== 401) { lista.replaceChildren(crear("p", { class: "lista-vacia", text: r.datos.error || "No pudimos leer la lista." })); } return; }
        const d = r.datos;
        const filas = tipo === "pedidos" ? d.pedidos : d.facturas;
        if (tipo === "facturas") $(".facturas-cuenta").replaceChildren(...tarjetasCuenta(d.estadoDeCuenta));
        conteo.textContent = tipo === "pedidos"
            ? `${d.total.toLocaleString("es-VE")} ${d.total === 1 ? "pedido" : "pedidos"} con estos filtros. Toca uno para ver su detalle.`
            : `${d.total.toLocaleString("es-VE")} ${d.total === 1 ? "documento" : "documentos"} con estos filtros. Montos en dólares.`;
        lista.replaceChildren(...(filas.length
            ? filas.map((x) => (tipo === "pedidos" ? filaPedido(x) : filaFactura(x)))
            : [crear("p", { class: "lista-vacia", text: tipo === "pedidos" ? "No hay pedidos con estos filtros." : "No hay facturas con estos filtros." })]));
        paginas(tipo, d.total, d.pagina, d.porPagina);
        if (subir) vista.scrollIntoView({ behavior: P.QUIETO ? "auto" : "smooth", block: "start" });
    };
    for (const tipo of ["pedidos", "facturas"]) {
        const form = $(`[data-filtros="${tipo}"]`);
        let espera = 0;
        form.addEventListener("input", (ev) => {
            if (ev.target.type !== "search") return;
            clearTimeout(espera);
            espera = setTimeout(() => { estadoLista[tipo].pagina = 1; cargarLista(tipo); }, 350);
        });
        form.addEventListener("change", (ev) => { if (ev.target.tagName === "SELECT") { estadoLista[tipo].pagina = 1; cargarLista(tipo); } });
        form.addEventListener("submit", (ev) => { ev.preventDefault(); estadoLista[tipo].pagina = 1; cargarLista(tipo); });
    }

    // Pestañas (y el enlace: #pedidos, #facturas)
    const pestanas = $$(".panel-nav [role=tab]");
    const cargadas = new Set();
    function irVista(nombre, { foco = false, historial = true } = {}) {
        if (!["resumen", "pedidos", "facturas"].includes(nombre)) nombre = "resumen";
        for (const t of pestanas) {
            const activa = t.dataset.vista === nombre;
            t.setAttribute("aria-selected", String(activa));
            t.tabIndex = activa ? 0 : -1;
            $(`#vista-${t.dataset.vista}`).hidden = !activa;
            if (activa && foco) t.focus();
        }
        if (historial && location.hash !== `#${nombre}`) history.replaceState(null, "", nombre === "resumen" ? location.pathname + location.search : `#${nombre}`);
        if (nombre === "resumen" && !cargadas.has("resumen")) { cargadas.add("resumen"); cargarResumen(); }
        if (nombre !== "resumen") { cargadas.add(nombre); cargarLista(nombre); }
    }
    for (const t of pestanas) {
        t.addEventListener("click", () => irVista(t.dataset.vista));
        t.addEventListener("keydown", (ev) => {
            if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(ev.key)) return;
            ev.preventDefault();
            const i = pestanas.indexOf(t);
            const adelante = ev.key === "ArrowRight" || ev.key === "ArrowDown";
            const j = ev.key === "Home" ? 0 : ev.key === "End" ? pestanas.length - 1 : (i + (adelante ? 1 : -1) + pestanas.length) % pestanas.length;
            irVista(pestanas[j].dataset.vista, { foco: true });
        });
    }
    for (const b of $$("[data-ir-vista]")) b.addEventListener("click", () => irVista(b.dataset.irVista, { foco: true }));

    /* ---------------------------------------------------------------- Detalle del pedido (panel lateral) */
    const detalle = $(".detalle-pedido");
    const fondoDetalle = $(".detalle-fondo");
    let focoDetalle = null;
    let pedidoAbierto = null;
    const ETAPAS = [["cotizacion", "Cotización"], ["confirmado", "Confirmado"], ["despachado", "Despachado"], ["facturado", "Facturado"]];
    function cerrarDetalle(devolver = true) {
        if (!document.body.classList.contains("detalle-abierto")) return;
        document.body.classList.remove("detalle-abierto");
        document.documentElement.classList.remove("carrito-abierto");
        detalle.inert = true;
        if (devolver && focoDetalle?.isConnected) focoDetalle.focus({ preventScroll: true });
    }
    $(".detalle-cerrar").addEventListener("click", () => cerrarDetalle());
    fondoDetalle.addEventListener("click", () => cerrarDetalle());
    document.addEventListener("keydown", (ev) => {
        if (!document.body.classList.contains("detalle-abierto") || document.body.classList.contains("carrito-abierto")) return;
        if (ev.key === "Escape") { ev.preventDefault(); cerrarDetalle(); return; }
        if (ev.key !== "Tab") return;
        const enfocables = $$("button, a[href]", detalle).filter((e) => !e.disabled && e.offsetParent !== null);
        if (!enfocables.length) return;
        if (ev.shiftKey && document.activeElement === enfocables[0]) { ev.preventDefault(); enfocables[enfocables.length - 1].focus(); }
        else if (!ev.shiftKey && document.activeElement === enfocables[enfocables.length - 1]) { ev.preventDefault(); enfocables[0].focus(); }
    });

    async function abrirDetalle(id, origen) {
        focoDetalle = origen || document.activeElement;
        pedidoAbierto = null;
        $(".detalle-sobre").textContent = "Pedido";
        $("#detalle-titulo").textContent = "Cargando…";
        $(".detalle-cuerpo").replaceChildren(...esqueletoFilas(5));
        $(".detalle-repetir").disabled = true;
        detalle.inert = false;
        document.body.classList.add("detalle-abierto");
        document.documentElement.classList.add("carrito-abierto");
        $(".detalle-cerrar").focus({ preventScroll: true });
        const r = await llamar(`pedidos/${id}`);
        if (!r.ok) { if (r.status !== 401) $(".detalle-cuerpo").replaceChildren(crear("p", { class: "lista-vacia", text: r.datos.error || "No pudimos abrir el pedido." })); return; }
        pintarDetalle(r.datos);
    }
    function pintarDetalle(p) {
        pedidoAbierto = p;
        $(".detalle-sobre").textContent = `${p.sede.nombre} · ${fecha(p.fecha)}`;
        $("#detalle-titulo").textContent = p.numero;
        const idx = ETAPAS.findIndex(([e]) => e === p.etapa);
        const pasos = p.etapa === "anulado"
            ? crear("p", { class: "detalle-anulado" }, [insignia("anulado", "Pedido anulado")])
            : crear("ol", { class: "etapas", "aria-label": `Estado: ${p.etapaNombre}` }, ETAPAS.map(([e, nombre], i) => {
                const li = crear("li", { class: i < idx ? "hecha" : i === idx ? "actual" : "" }, [crear("span", { class: "etapa-punto", "aria-hidden": "true" }), crear("span", { text: nombre })]);
                if (i === idx) li.setAttribute("aria-current", "step");
                return li;
            }));
        const datos = crear("dl", { class: "detalle-datos" }, [
            ["Sede", p.sede.nombre], ["Fecha", fecha(p.fecha)], ...(p.referencia ? [["Tu referencia", p.referencia]] : []), ...(p.vendedor ? [["Vendedor", p.vendedor]] : []),
        ].map(([k, v]) => crear("div", {}, [crear("dt", { text: k }), crear("dd", { text: v })])));
        const lineas = crear("div", { class: "detalle-lineas", role: "list", "aria-label": "Productos del pedido" }, p.lineas.map((l) => crear("div", { class: "detalle-linea", role: "listitem" }, [
            crear("span", { class: "detalle-linea-texto" }, [
                crear("strong", { text: l.descripcion }),
                crear("small", { text: [l.codigo, `${cantidad(l.cantidad)} × ${dinero(l.precio, p.moneda)}`, l.descuento ? `−${cantidad(l.descuento)} %` : "", p.etapa !== "cotizacion" && l.despachado < l.cantidad ? `despachado ${cantidad(l.despachado)}` : ""].filter(Boolean).join(" · ") }),
            ]),
            crear("span", { class: "detalle-linea-monto", text: dinero(l.subtotal, p.moneda) }),
        ])));
        const totales = crear("dl", { class: "detalle-totales" }, [
            ["Subtotal", dinero(p.subtotal, p.moneda)], ["Impuestos", dinero(p.total - p.subtotal, p.moneda)], ["Total", dinero(p.total, p.moneda)],
        ].map(([k, v], i, a) => crear("div", i === a.length - 1 ? { class: "total" } : {}, [crear("dt", { text: k }), crear("dd", { text: v })])));
        const bloques = [pasos, datos, crear("h3", { class: "detalle-sub", text: `Productos (${p.lineas.length})` }), lineas, totales];
        if (p.despachos.length) {
            bloques.push(crear("h3", { class: "detalle-sub", text: "Despachos" }), crear("ul", { class: "detalle-docs" }, p.despachos.map((d) => crear("li", {}, [crear("span", { text: d.numero }), crear("span", { text: `${d.estado}${d.fecha ? ` · ${fecha(d.fecha)}` : ""}` })]))));
        }
        if (p.facturas.length) {
            bloques.push(crear("h3", { class: "detalle-sub", text: "Facturas" }), crear("ul", { class: "detalle-docs" }, p.facturas.map((f) => crear("li", {}, [crear("span", { text: `${f.nota ? "Nota de crédito " : ""}${f.numero}` }), crear("span", { text: `${fecha(f.fecha)} · ${dinero(f.total)}` })]))));
        }
        $(".detalle-cuerpo").replaceChildren(...bloques);
        const repetibles = p.lineas.filter((l) => l.codigo);
        $(".detalle-repetir").disabled = !repetibles.length;
    }
    $(".detalle-repetir").addEventListener("click", () => {
        if (!pedidoAbierto) return;
        const lista = pedidoAbierto.lineas.filter((l) => l.codigo && l.cantidad > 0).map((l) => [l.codigo, l.cantidad]);
        const n = P.sumarCodigos(lista);
        if (!n) return;
        cerrarDetalle(false);
        P.abrirCotizacion();
    });

    /* ---------------------------------------------------------------- Cerrar sesión */
    $(".panel-salir").addEventListener("click", async () => {
        // Cierra la sesión en todos los equipos (el servidor anula los tokens) y aquí.
        await llamar("salir", { metodo: "POST" });
        borrarToken();
        cargadas.clear();
        mostrarAcceso("Cerraste tu sesión.");
        $(".cuenta-fallo", formEntrar).classList.add("cuenta-ok");
    });
    formEntrar.addEventListener("input", () => $(".cuenta-fallo", formEntrar).classList.remove("cuenta-ok"));

    function mostrarPanel() {
        acceso.hidden = true;
        panel.hidden = false;
        cargadas.clear();
        // El resumen trae también quién es (la cabecera): se pide siempre, aunque se abra en otra pestaña.
        cargadas.add("resumen");
        cargarResumen();
        irVista((location.hash || "").replace("#", "") || "resumen", { historial: false });
        window.scrollTo({ top: 0 });
    }

    // Arranque: con token, el panel; sin él, entrar. Sin API, se avisa.
    if (!api) { mostrarAcceso("La cuenta no está disponible en este momento."); return; }
    if (tokenEnMemoria) mostrarPanel(); else mostrarAcceso();
})();
