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
    // las columnas se acomodan como una tarjeta (mi-cuenta.css). Lleva las fotos de los primeros productos,
    // cuántos son y, si está confirmado, cuánto se ha despachado.
    const celda = (clase, hijos) => crear("span", { class: `celda ${clase}`, role: "cell" }, hijos);
    const MESES_LARGOS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    const mesDe = (f) => (f ? `${MESES_LARGOS[Number(f.slice(5, 7)) - 1]} ${f.slice(0, 4)}` : "");
    const pilaFotos = (ids) => crear("span", { class: "fotos-pila", "aria-hidden": "true" },
        (ids && ids.length ? ids : [0]).map((id) => (id ? crear("img", { src: P.foto(id, 128), alt: "", loading: "lazy" }) : crear("span", { class: "foto-vacia" }))));
    const filaPedido = (p) => {
        const detalle = p.productos ? `${p.productos} ${p.productos === 1 ? "producto" : "productos"} · ${cantidad(p.unidades)} u.` : "";
        const estado = [insignia(p.etapa, p.etapaNombre)];
        if (p.etapa === "confirmado" && p.productos) {
            estado.push(crear("span", { class: "avance" }, [
                crear("span", { class: "avance-barra" }, [crear("span", { style: `width:${Math.max(4, p.avance)}%` })]),
                crear("small", { text: `${p.avance}% despachado` }),
            ]));
        }
        const b = crear("button", { type: "button", class: "fila fila-pedido", role: "row", "aria-label": `Pedido ${p.numero} del ${fecha(p.fecha)}, ${p.sede.nombre}, ${p.etapaNombre}, ${dinero(p.total, p.moneda)}. Ver el detalle` }, [
            celda("c-numero", [pilaFotos(p.fotos), crear("span", { class: "c-numero-texto" }, [
                crear("strong", { text: p.numero }),
                crear("small", { text: [detalle, p.referencia ? `Ref. ${p.referencia}` : ""].filter(Boolean).join(" · ") }),
            ])]),
            celda("c-fecha", [fecha(p.fecha)]),
            celda("c-sede", [p.sede.nombre]),
            celda("c-estado", estado),
            celda("c-monto", [dinero(p.total, p.moneda)]),
            crear("span", { class: "celda c-ir", "aria-hidden": "true" }, [P.icono("ir", "icono-ir")]),
        ]);
        b.addEventListener("click", () => abrirDetalle(p.id, b));
        return b;
    };
    const filaFactura = (f) => crear("div", { class: "fila fila-factura", role: "row" }, [
        celda("c-numero", [crear("span", { class: "c-numero-texto" }, [crear("strong", { text: f.numero }), crear("small", { text: [f.sede.nombre, f.pedido ? `Pedido ${f.pedido}` : ""].filter(Boolean).join(" · ") })])]),
        celda("c-fecha", [fecha(f.fecha)]),
        celda("c-vence", [f.estado === "nota" || !f.vence ? "—" : fecha(f.vence)]),
        celda("c-estado", [insignia(f.estado, f.estado === "vencida" && f.atraso ? `Vencida · ${f.atraso} ${f.atraso === 1 ? "día" : "días"}` : f.estadoNombre)]),
        celda("c-monto", [dinero(f.total)]),
        celda(`c-saldo${f.saldo > 0.009 ? " con-saldo" : ""}`, [f.saldo > 0.009 ? dinero(f.saldo) : "—"]),
    ]);

    // Antigüedad de la deuda: una barra con un tramo por color y su leyenda.
    const TRAMOS = [["porVencer", "Por vencer"], ["d1_30", "1 a 30 días"], ["d31_60", "31 a 60 días"], ["d61_90", "61 a 90 días"], ["d90", "Más de 90 días"]];
    const barraTramos = (tramos, conLeyenda) => {
        const total = TRAMOS.reduce((a, [k]) => a + Math.max(0, Number(tramos?.[k]) || 0), 0);
        const barra = crear("div", { class: "tramos-barra", role: "img", "aria-label": TRAMOS.filter(([k]) => tramos?.[k] > 0).map(([k, n]) => `${n}: ${dinero(tramos[k])}`).join("; ") || "Sin deuda" },
            TRAMOS.filter(([k]) => tramos?.[k] > 0).map(([k]) => crear("span", { class: `tramo-${k}`, style: `width:${(tramos[k] / total) * 100}%` })));
        if (!conLeyenda) return barra;
        return crear("div", { class: "tramos" }, [barra, crear("ul", { class: "tramos-leyenda" }, TRAMOS.map(([k, n]) => crear("li", { class: tramos?.[k] > 0 ? "" : "vacio" }, [
            crear("span", { class: `tramo-punto tramo-${k}`, "aria-hidden": "true" }), crear("span", { text: n }), crear("strong", { text: dinero(tramos?.[k] || 0) }),
        ])))]);
    };

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
            const t = crear("button", { type: "button", class: `tarjeta-resumen tarjeta-boton${s.vencido > 0.009 ? " tarjeta-alerta" : ""}` }, [
                crear("p", { class: "tarjeta-titulo", text: `Debes en ${s.sede.nombre}` }),
                crear("p", { class: "tarjeta-cifra", text: dinero(s.saldo) }),
                barraTramos(s.tramos, false),
                crear("p", { class: "tarjeta-nota", text: s.vencido > 0.009
                    ? `${dinero(s.vencido)} vencido · la más vieja, hace ${s.masVieja} ${s.masVieja === 1 ? "día" : "días"}`
                    : `${s.facturasAbiertas} ${s.facturasAbiertas === 1 ? "factura abierta" : "facturas abiertas"}, nada vencido` }),
            ]);
            t.addEventListener("click", () => irVista("facturas"));
            tarjetas.push(t);
        }
        if (pedidosAbiertos !== undefined) {
            const t = crear("button", { type: "button", class: "tarjeta-resumen tarjeta-boton tarjeta-pedidos" }, [
                crear("p", { class: "tarjeta-titulo", text: "Pedidos en curso" }),
                crear("p", { class: "tarjeta-cifra", text: String(pedidosAbiertos) }),
                crear("p", { class: "tarjeta-nota", text: pedidosAbiertos ? "Confirmados y todavía sin facturar completos" : "No tienes pedidos en curso" }),
            ]);
            t.addEventListener("click", () => { $("#f-pedido-etapa").value = "abiertos"; estadoLista.pedidos.pagina = 1; irVista("pedidos"); });
            tarjetas.push(t);
        }
        return tarjetas;
    };

    // Estado de cuenta: una tarjeta por sede con el saldo, lo vencido, la antigüedad y lo próximo a vencer.
    const estadoCuenta = (estado) => {
        const deudas = (estado || []).filter((s) => Math.abs(s.saldo) >= 0.01);
        if (!deudas.length) {
            return [crear("div", { class: "cuenta-sede cuenta-al-dia" }, [
                crear("div", { class: "cuenta-al-dia-icono", "aria-hidden": "true" }, [P.icono("listo")]),
                crear("div", {}, [crear("p", { class: "cuenta-sede-cifra", text: "Estás al día" }), crear("p", { class: "tarjeta-nota", text: "No tienes facturas por pagar en ninguna sede." })]),
            ])];
        }
        return deudas.map((s) => crear("section", { class: `cuenta-sede${s.vencido > 0.009 ? " con-vencido" : ""}`, "aria-label": `Estado de cuenta en ${s.sede.nombre}` }, [
            crear("div", { class: "cuenta-sede-cabeza" }, [
                crear("div", {}, [
                    crear("p", { class: "tarjeta-titulo", text: `Sede ${s.sede.nombre}` }),
                    crear("p", { class: "cuenta-sede-cifra", text: dinero(s.saldo) }),
                    crear("p", { class: "tarjeta-nota", text: `${s.facturasAbiertas} ${s.facturasAbiertas === 1 ? "factura abierta" : "facturas abiertas"}` }),
                ]),
                s.vencido > 0.009
                    ? crear("div", { class: "cuenta-vencido" }, [crear("small", { text: "Vencido" }), crear("strong", { text: dinero(s.vencido) }), crear("small", { text: `la más vieja, hace ${s.masVieja} ${s.masVieja === 1 ? "día" : "días"}` })])
                    : crear("div", { class: "cuenta-vencido cuenta-sin-vencido" }, [crear("small", { text: "Vencido" }), crear("strong", { text: dinero(0) }), crear("small", { text: "nada vencido" })]),
            ]),
            crear("div", { class: "cuenta-sede-cuerpo" }, [
                crear("div", {}, [crear("h3", { class: "cuenta-sub", text: "Antigüedad de la deuda" }), barraTramos(s.tramos, true)]),
                crear("div", {}, [
                    crear("h3", { class: "cuenta-sub", text: "Próximos vencimientos" }),
                    s.proximos && s.proximos.length
                        ? crear("ul", { class: "proximos" }, s.proximos.map((x) => crear("li", {}, [
                            crear("span", { class: "proximo-fecha" }, [crear("strong", { text: fecha(x.vence).split(" ").slice(0, 2).join(" ") }), crear("small", { text: x.vence.slice(0, 4) })]),
                            crear("span", { class: "proximo-numero", text: x.numero }),
                            crear("strong", { class: "proximo-monto", text: dinero(x.saldo) }),
                        ])))
                        : crear("p", { class: "tarjeta-nota", text: "No hay facturas por vencer: lo abierto ya está vencido." }),
                ]),
            ]),
        ]));
    };
    $(".imprimir-cuenta").addEventListener("click", () => window.print());

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
        const pf = r.datos.perfil;
        pintarAvatar(pf && pf.logo, (pf && pf.nombre) || c.empresa || c.nombre);
        $(".panel-empresa").textContent = (pf && pf.nombre) || c.empresa || "";
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
    const paginas = (tipo, total, pagina, porPagina, alElegir) => {
        const cont = $(`[data-paginas="${tipo}"]`);
        const n = Math.ceil(total / porPagina);
        if (n <= 1) { cont.replaceChildren(); return; }
        const boton = (texto, p, actual = false) => {
            const b = crear("button", { type: "button", class: "pagina", text: texto, disabled: p < 1 || p > n || actual });
            if (actual) b.setAttribute("aria-current", "page");
            b.addEventListener("click", () => (alElegir ? alElegir(p) : (estadoLista[tipo].pagina = p, cargarLista(tipo, true))));
            return b;
        };
        const nums = [...new Set([1, pagina - 1, pagina, pagina + 1, n])].filter((p) => p >= 1 && p <= n).sort((a, b) => a - b);
        const partes = [boton("Anterior", pagina - 1)];
        nums.forEach((p, i) => { if (i && p - nums[i - 1] > 1) partes.push(crear("span", { class: "pagina-salto", text: "…" })); partes.push(boton(String(p), p, p === pagina)); });
        partes.push(boton("Siguiente", pagina + 1));
        cont.replaceChildren(...partes);
    };
    // Filtros de estado de los pedidos: pastillas con cuántos hay en cada uno.
    const ETAPAS_FILTRO = [["", "Todos", "todos"], ["abiertos", "En curso", "abiertos"], ["cotizacion", "Cotizaciones", "cotizacion"], ["facturado", "Facturados", "facturado"], ["anulado", "Anulados", "anulado"]];
    const pintarChips = (porEtapa) => {
        const actual = $("#f-pedido-etapa").value;
        $(".chips-etapa").replaceChildren(...ETAPAS_FILTRO.map(([valor, nombre, clave]) => {
            const n = porEtapa ? porEtapa[clave] : null;
            const b = crear("button", { type: "button", class: "chip-etapa", "aria-pressed": String(valor === actual) }, [crear("span", { text: nombre }), ...(n !== null && n !== undefined ? [crear("span", { class: "chip-n", text: n.toLocaleString("es-VE") })] : [])]);
            b.addEventListener("click", () => { $("#f-pedido-etapa").value = valor; estadoLista.pedidos.pagina = 1; cargarLista("pedidos"); });
            return b;
        }));
        // La pestaña elegida, a la vista; y el desvanecido en el borde que tiene más pestañas.
        const elegida = $(".chip-etapa[aria-pressed=true]", fila);
        if (elegida && fila.scrollWidth > fila.clientWidth) fila.scrollLeft = Math.max(0, elegida.offsetLeft - 24);
        bordesChips();
    };
    const fila = $(".chips-etapa");
    const bordesChips = () => {
        const sobra = fila.scrollWidth - fila.clientWidth;
        fila.classList.toggle("mas-izquierda", sobra > 1 && fila.scrollLeft > 1);
        fila.classList.toggle("mas-derecha", sobra > 1 && fila.scrollLeft < sobra - 1);
    };
    fila.addEventListener("scroll", bordesChips, { passive: true });
    window.addEventListener("resize", bordesChips);
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
        if (tipo === "pedidos") pintarChips(null);
        if (tipo === "facturas") $(".estado-cuenta").replaceChildren(crear("div", { class: "cuenta-sede esqueleto", "aria-hidden": "true" }));
        const r = await llamar(`${tipo}?${q}`);
        if (mio !== pedidoLista) return; // llegó otra búsqueda después
        lista.removeAttribute("aria-busy");
        if (!r.ok) { if (r.status !== 401) { lista.replaceChildren(crear("p", { class: "lista-vacia", text: r.datos.error || "No pudimos leer la lista." })); } return; }
        const d = r.datos;
        const filas = tipo === "pedidos" ? d.pedidos : d.facturas;
        if (tipo === "facturas") $(".estado-cuenta").replaceChildren(...estadoCuenta(d.estadoDeCuenta));
        if (tipo === "pedidos") pintarChips(d.porEtapa);
        conteo.textContent = tipo === "pedidos"
            ? `${d.total.toLocaleString("es-VE")} ${d.total === 1 ? "pedido" : "pedidos"} con estos filtros. Toca uno para ver su detalle y repetirlo.`
            : "Lo que debes en cada sede, cuánto tiene de vencido y tus facturas. Montos en dólares.";
        const contenido = [];
        let mesAnterior = "";
        for (const x of filas) {
            // Los pedidos van agrupados por mes.
            if (tipo === "pedidos" && mesDe(x.fecha) !== mesAnterior) {
                mesAnterior = mesDe(x.fecha);
                contenido.push(crear("div", { class: "fila-mes", role: "row" }, [crear("span", { role: "cell", text: mesAnterior })]));
            }
            contenido.push(tipo === "pedidos" ? filaPedido(x) : filaFactura(x));
        }
        lista.replaceChildren(...(contenido.length ? contenido
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

    /* ---------------------------------------------------------------- Perfil */
    const enlaceWhatsapp = (tel) => {
        let d = String(tel || "").replace(/\D/g, "");
        if (!d) return "";
        if (d.startsWith("0")) d = `58${d.slice(1)}`;
        return d.length >= 10 ? `https://wa.me/${d}` : "";
    };
    const filasDatos = (pares) => pares.filter(([, v]) => v).map(([k, v]) => crear("div", {}, [crear("dt", { text: k }), crear("dd", { text: v })]));

    // Íconos fijos (texto propio, nunca datos del cliente): se pueden poner con innerHTML.
    const ICONOS_PERFIL = {
        instagram: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r=".7"/>',
        facebook: '<path d="M14 21v-8h3l.5-3.5H14V7.8c0-1 .4-1.8 1.8-1.8h1.8V3.2A22 22 0 0 0 15 3c-2.6 0-4.4 1.6-4.4 4.5v2H8V13h2.6v8"/>',
        tiktok: '<path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5M14 3c.4 2.6 2.2 4.4 5 4.6"/>',
        x: '<path d="M4 4h4.5L20 20h-4.5zM19.5 4l-6.6 7.4M4.5 20l6.6-7.4"/>',
        linkedin: '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M8 10.5V16M8 7.8v.2M11.5 16v-5.5M11.5 13c0-1.6 1-2.6 2.4-2.6S16 11.4 16 13v3"/>',
        web: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.3 2.5 3.4 5.3 3.4 8.5s-1.1 6-3.4 8.5c-2.3-2.5-3.4-5.3-3.4-8.5s1.1-6 3.4-8.5z"/>',
        persona: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
        telefono: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
        lugar: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
        mas: '<path d="M12 5v14M5 12h14"/>',
        quitar: '<path d="M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
        subir: '<path d="M12 16V4M7 9l5-5 5 5M4 16v4h16v-4"/>',
        editar: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
        mira: '<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/><circle cx="12" cy="12" r="8"/>',
        buscar: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
        chispa: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
        listo: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
        cerrar: '<path d="M6 6l12 12M18 6 6 18"/>',
        edificio: '<path d="M4 21V5l8-2v18M12 21V9l8 2v10M3 21h18M7 8h2M7 12h2M7 16h2M15 13h2M15 17h2"/>',
    };
    const iconoFijo = (nombre, clase = "icono-linea") => {
        const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        s.setAttribute("viewBox", "0 0 24 24");
        s.setAttribute("aria-hidden", "true");
        s.setAttribute("class", clase);
        s.innerHTML = ICONOS_PERFIL[nombre] || "";
        return s;
    };
    const boton = (clase, hijos, accion, extra = {}) => {
        const b = crear("button", { type: "button", class: clase, ...extra }, hijos);
        if (accion) b.addEventListener("click", accion);
        return b;
    };
    const REDES = [
        ["instagram", "Instagram", "@tuempresa"], ["facebook", "Facebook", "facebook.com/tuempresa"], ["tiktok", "TikTok", "@tuempresa"],
        ["x", "X (Twitter)", "@tuempresa"], ["linkedin", "LinkedIn", "linkedin.com/company/tuempresa"],
    ];
    const HOSTS_RED = { instagram: ["instagram.com"], facebook: ["facebook.com", "fb.com"], tiktok: ["tiktok.com"], x: ["x.com", "twitter.com"], linkedin: ["linkedin.com"] };
    // De qué red es un enlace pegado (para moverlo a su campo si lo pegaron en otro).
    const redDeEnlace = (v) => {
        const t = String(v || "").trim();
        if (!/[./]/.test(t)) return null;
        let host = "";
        try { host = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`).hostname.toLowerCase().replace(/^(www\.|m\.)/, ""); } catch (e) { return null; }
        for (const [id, hosts] of Object.entries(HOSTS_RED)) if (hosts.some((h) => host === h || host.endsWith(`.${h}`))) return id;
        return null;
    };
    const textoRed = (id, url) => {
        try {
            const u = new URL(url);
            if (id === "web") return (u.host + u.pathname).replace(/^www\./, "").replace(/\/$/, "");
            const ultimo = u.pathname.split("/").filter(Boolean).pop() || u.host;
            return `@${ultimo.replace(/^@/, "")}`;
        } catch (e) { return url; }
    };
    const claveRif = (v) => String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    // «j123456789» → «J-12345678-9» mientras escribe; un RUC de Panamá queda como está.
    const formatearRif = (v) => {
        const t = String(v || "").toUpperCase().replace(/[\s.]/g, "");
        const m = t.match(/^([VJEGP])-?(\d{5,8})-?(\d)?$/);
        return m ? `${m[1]}-${m[2]}${m[3] ? `-${m[3]}` : ""}` : t;
    };
    const pintarAvatar = (logo, texto) => {
        for (const a of $$(".panel-avatar")) {
            a.classList.toggle("con-logo", Boolean(logo));
            a.style.backgroundImage = logo ? `url("${logo}")` : "";
            a.textContent = logo ? "" : iniciales(texto);
        }
    };
    const copia = (x) => JSON.parse(JSON.stringify(x));
    const datosDe = (e) => copia({ nombre: e.nombre, razones: e.razones, redes: e.redes });

    // Un aviso corto abajo («Sucursal guardada»).
    let avisoListoT = 0;
    const avisoListo = (texto) => {
        let n = $(".perfil-toast");
        if (!n) { n = crear("div", { class: "perfil-toast", role: "status" }); document.body.append(n); }
        n.replaceChildren(iconoFijo("listo"), crear("span", { text: texto }));
        n.classList.add("visible");
        clearTimeout(avisoListoT);
        avisoListoT = setTimeout(() => n.classList.remove("visible"), 2600);
    };

    /* ---- Mapas: Leaflet con los mapas de OpenStreetMap; direcciones con Nominatim (desde el navegador) */
    let leaflet = null;
    const cargarLeaflet = () => {
        if (window.L) return Promise.resolve(window.L);
        if (leaflet) return leaflet;
        leaflet = new Promise((ok) => {
            const css = crear("link", { rel: "stylesheet", href: "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css", integrity: "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=", crossOrigin: "" });
            const js = crear("script", { src: "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js", integrity: "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=", crossOrigin: "" });
            const t = setTimeout(() => ok(null), 9000);
            js.onload = () => { clearTimeout(t); ok(window.L || null); };
            js.onerror = () => { clearTimeout(t); leaflet = null; ok(null); };
            document.head.append(css, js);
        });
        return leaflet;
    };
    const NOMINATIM = "https://nominatim.openstreetmap.org";
    const direccionCorta = (r) => {
        const a = r.address || {};
        const calle = [a.road || a.pedestrian || a.footway, a.house_number].filter(Boolean).join(" ");
        const partes = [a.building || a.shop || a.office || a.amenity, calle, a.neighbourhood || a.suburb || a.quarter, a.city || a.town || a.village || a.municipality || a.county, a.state]
            .filter(Boolean);
        return [...new Set(partes)].join(", ") || String(r.display_name || "").split(",").slice(0, 4).join(",").trim();
    };
    const buscarLugares = async (q) => {
        try {
            const r = await fetch(`${NOMINATIM}/search?${new URLSearchParams({ format: "jsonv2", q, countrycodes: "ve,pa", limit: "5", addressdetails: "1", "accept-language": "es" })}`);
            if (!r.ok) return [];
            return (await r.json()).map((x) => ({ nombre: direccionCorta(x), completo: String(x.display_name || ""), lat: Number(x.lat), lng: Number(x.lon) }));
        } catch (e) { return []; }
    };
    const lugarDe = async (lat, lng) => {
        try {
            const r = await fetch(`${NOMINATIM}/reverse?${new URLSearchParams({ format: "jsonv2", lat: String(lat), lon: String(lng), zoom: "18", addressdetails: "1", "accept-language": "es" })}`);
            if (!r.ok) return "";
            return direccionCorta(await r.json());
        } catch (e) { return ""; }
    };
    const redondeo = (n) => Math.round(n * 1e6) / 1e6;
    const CENTRO_SEDE = { valencia: [10.162, -68.0077], caracas: [10.4806, -66.9036], panama: [8.9824, -79.5199] };
    // Vista fija del mapa (3×3 mosaicos de OpenStreetMap) con el pin al centro: liviana, sin cargar Leaflet.
    const miniMapa = (lat, lng) => {
        const z = 16;
        const n = 2 ** z;
        const xt = ((lng + 180) / 360) * n;
        const r = (lat * Math.PI) / 180;
        const yt = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
        const tx = Math.floor(xt);
        const ty = Math.floor(yt);
        const px = (xt - tx) * 256 + 256;
        const py = (yt - ty) * 256 + 256;
        const rejilla = crear("div", { class: "mini-mapa-rejilla", style: `left:calc(50% - ${px.toFixed(1)}px);top:calc(50% - ${py.toFixed(1)}px)` });
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            rejilla.append(crear("img", { src: `https://tile.openstreetmap.org/${z}/${tx + dx}/${ty + dy}.png`, alt: "", loading: "lazy", draggable: false }));
        }
        return crear("a", { class: "mini-mapa", href: `https://www.google.com/maps?q=${lat},${lng}`, target: "_blank", rel: "noopener", "aria-label": "Ver la sucursal en el mapa" }, [
            rejilla, crear("span", { class: "pin-mapa", "aria-hidden": "true" }), crear("span", { class: "mini-mapa-credito", text: "© OpenStreetMap" }),
        ]);
    };

    /* ---- Imágenes: el logo se achica en el navegador (máximo 512 px, WebP o PNG) antes de mandarlo */
    const achicarImagen = async (src) => {
        const img = await new Promise((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = mal; i.src = src; });
        let lado = 512;
        let dato = "";
        for (let intento = 0; intento < 4; intento++) {
            const escala = Math.min(1, lado / Math.max(img.naturalWidth, img.naturalHeight));
            const lienzo = crear("canvas", { width: Math.max(1, Math.round(img.naturalWidth * escala)), height: Math.max(1, Math.round(img.naturalHeight * escala)) });
            lienzo.getContext("2d").drawImage(img, 0, 0, lienzo.width, lienzo.height);
            dato = lienzo.toDataURL("image/webp", 0.9);
            if (!dato.startsWith("data:image/webp")) dato = lienzo.toDataURL("image/png");
            if (dato.length * 0.75 <= 380 * 1024) return dato;
            lado = Math.round(lado * 0.75);
        }
        return null;
    };

    /* ---- Datos y guardado */
    let perfilDatos = null;
    let editable = null;
    // Guarda el perfil entero (la API lo pide así) y deja `editable` al día. 409 = otra persona lo cambió: se relee.
    const guardar = async (datos, logo) => {
        const cuerpo = { version: editable.version, ...datos };
        if (logo !== undefined) cuerpo.logo = logo;
        const r = await llamar("perfil", { metodo: "POST", cuerpo });
        if (r.ok) {
            editable = { ...r.datos.editable, conocidas: editable.conocidas };
            pintarTodo();
            pintarAvatar(editable.logo, editable.nombre);
            $(".panel-empresa").textContent = editable.nombre;
            return { ok: true };
        }
        if (r.status === 409) setTimeout(cargarPerfil, 2200);
        return { ok: false, error: r.datos.error || "No pudimos guardar. Intenta de nuevo.", campo: r.datos.campo || "" };
    };

    /* ---- Lo que falta para completar el perfil (guía, no traba) */
    const pasosPerfil = (e) => {
        const sucursales = e.razones.flatMap((r, i) => r.sucursales.map((s, j) => ({ s, i, j })));
        const sinMapa = sucursales.filter(({ s }) => typeof s.lat !== "number");
        return [
            { id: "guardar", hecho: e.guardado, texto: "Confirma tus datos", accion: () => confirmarPropuesta() },
            { id: "logo", hecho: Boolean(e.logo), texto: "Sube tu logo", accion: () => { irPestanaPerfil("empresa"); editarEmpresa("logo"); } },
            { id: "redes", hecho: Object.keys(e.redes || {}).length > 0, texto: "Agrega tus redes", accion: () => { irPestanaPerfil("empresa"); editarEmpresa("web"); } },
            { id: "mapa", hecho: sucursales.length > 0 && !sinMapa.length, texto: sinMapa.length > 1 ? `Ubica ${sinMapa.length} sucursales en el mapa` : "Ubica tu sucursal en el mapa", accion: () => { irPestanaPerfil("sucursales"); if (sinMapa[0]) abrirSucursal(sinMapa[0].i, sinMapa[0].j); } },
        ];
    };

    const pintarHero = () => {
        const e = editable;
        const sucursales = e.razones.reduce((a, r) => a + r.sucursales.length, 0);
        const redes = [...REDES, ["web", "Página web"]].filter(([id]) => e.redes[id]);
        const pasos = pasosPerfil(e);
        const hechos = pasos.filter((p) => p.hecho).length;
        const pct = Math.round((hechos / pasos.length) * 100);
        const logo = boton("perfil-logo-boton", [
            e.logo ? crear("img", { class: "perfil-logo", src: e.logo, alt: `Logo de ${e.nombre}` }) : crear("span", { class: "perfil-logo perfil-logo-vacio", text: iniciales(e.nombre) }),
            crear("span", { class: "perfil-logo-lapiz", "aria-hidden": "true" }, [iconoFijo(e.logo ? "editar" : "subir")]),
        ], () => { irPestanaPerfil("empresa"); editarEmpresa("logo"); }, { "aria-label": e.logo ? "Cambiar el logo" : "Subir el logo" });
        $(".perfil-hero").replaceChildren(
            crear("div", { class: "perfil-hero-fondo", "aria-hidden": "true" }),
            crear("div", { class: "perfil-hero-cuerpo" }, [
                logo,
                crear("div", { class: "perfil-hero-texto" }, [
                    crear("h2", { class: "perfil-nombre", text: e.nombre }),
                    crear("p", { class: "tarjeta-nota", text: `${e.razones.length} ${e.razones.length === 1 ? "razón social" : "razones sociales"} · ${sucursales} ${sucursales === 1 ? "sucursal" : "sucursales"}` }),
                    redes.length ? crear("ul", { class: "perfil-redes", "aria-label": "Redes sociales" }, redes.map(([id, nombre]) => crear("li", {}, [
                        crear("a", { href: e.redes[id], target: "_blank", rel: "noopener nofollow", "aria-label": `${nombre}: ${textoRed(id, e.redes[id])}`, title: textoRed(id, e.redes[id]) }, [iconoFijo(id)]),
                    ]))) : crear("span"),
                ]),
                crear("div", { class: "perfil-avance", "aria-label": `Perfil completo al ${pct} %` }, [
                    crear("div", { class: "perfil-avance-cabeza" }, [crear("span", { text: pct === 100 ? "Perfil completo" : "Tu perfil" }), crear("strong", { text: `${pct} %` })]),
                    crear("div", { class: "perfil-avance-barra" }, [crear("span", { style: `width:${Math.max(4, pct)}%` })]),
                    pct < 100
                        ? crear("div", { class: "perfil-avance-pasos" }, pasos.filter((p) => !p.hecho).map((p) => boton("perfil-paso", [iconoFijo(p.id === "mapa" ? "lugar" : p.id === "logo" ? "subir" : p.id === "redes" ? "instagram" : "listo"), crear("span", { text: p.texto })], p.accion)))
                        : crear("p", { class: "tarjeta-nota", text: e.actualizadoEl ? `Actualizado el ${fecha(e.actualizadoEl)} por ${e.actualizadoPor}` : "" }),
                ]),
            ]),
        );
    };

    /* ---- Pestañas del perfil */
    const pestanasPerfil = $$(".perfil-pestanas [role=tab]");
    function irPestanaPerfil(id) {
        for (const t of pestanasPerfil) {
            const activa = t.dataset.pt === id;
            t.setAttribute("aria-selected", String(activa));
            t.tabIndex = activa ? 0 : -1;
            $(`#pp-${t.dataset.pt}`).hidden = !activa;
        }
    }
    for (const t of pestanasPerfil) {
        t.addEventListener("click", () => irPestanaPerfil(t.dataset.pt));
        t.addEventListener("keydown", (ev) => {
            const i = pestanasPerfil.indexOf(t);
            const n = ev.key === "ArrowRight" ? i + 1 : ev.key === "ArrowLeft" ? i - 1 : null;
            if (n === null) return;
            ev.preventDefault();
            const sig = pestanasPerfil[(n + pestanasPerfil.length) % pestanasPerfil.length];
            irPestanaPerfil(sig.dataset.pt);
            sig.focus();
        });
    }

    /* ---- Mi empresa: vista y edición en el mismo lugar */
    const pintarEmpresa = () => {
        const e = editable;
        const filaRed = (id, nombre) => crear("li", { class: "red-fila" }, [
            crear("span", { class: "red-icono" }, [iconoFijo(id)]),
            crear("span", { class: "red-nombre", text: nombre }),
            e.redes[id] ? crear("a", { class: "red-valor", href: e.redes[id], target: "_blank", rel: "noopener nofollow", text: textoRed(id, e.redes[id]) })
                : boton("red-agregar", ["Agregar"], () => editarEmpresa(id === "web" ? "web" : `red-${id}`)),
        ]);
        $(".perfil-empresa").replaceChildren(crear("div", { class: "tarjeta-perfil empresa-tarjeta" }, [
            crear("div", { class: "empresa-cabeza" }, [
                crear("h2", { class: "perfil-titulo", text: "Mi empresa" }),
                boton("boton boton-claro boton-chico", [iconoFijo("editar"), crear("span", { text: "Editar" })], () => editarEmpresa()),
            ]),
            crear("div", { class: "empresa-rejilla" }, [
                crear("div", { class: "empresa-dato" }, [crear("span", { class: "empresa-etiqueta", text: "Nombre del cliente" }), crear("strong", { text: e.nombre })]),
                crear("div", { class: "empresa-dato" }, [crear("span", { class: "empresa-etiqueta", text: "Logo" }),
                    e.logo ? crear("img", { class: "empresa-logo", src: e.logo, alt: "Tu logo" }) : boton("red-agregar", ["Subir logo"], () => editarEmpresa("logo"))]),
            ]),
            crear("div", {}, [
                crear("span", { class: "empresa-etiqueta", text: "Redes sociales y página web" }),
                crear("ul", { class: "redes-lista" }, [...REDES, ["web", "Página web"]].map(([id, nombre]) => filaRed(id, nombre))),
            ]),
        ]));
    };

    let igFicha = null; // lo último que respondió Instagram (para «Usar su foto como logo»)
    function editarEmpresa(enfocar) {
        const e = editable;
        const borrador = { nombre: e.nombre, redes: { ...e.redes } };
        let logoNuevo; // undefined = no lo tocó; null = lo quitó; data URL = nuevo
        const form = crear("form", { class: "tarjeta-perfil empresa-form", novalidate: true });
        const vistaLogo = crear("div", { class: "editor-logo-vista" });
        const quitar = boton("enlace-chico enlace-peligro", ["Quitar"], () => { logoNuevo = null; pintarLogo(); });
        const usarIg = boton("boton boton-claro boton-chico", [iconoFijo("instagram"), crear("span", { text: "Usar mi foto de Instagram" })], async () => {
            if (!igFicha?.foto) return;
            const d = await achicarImagen(igFicha.foto).catch(() => null);
            if (d) { logoNuevo = d; pintarLogo(); }
        }, { hidden: true });
        const pintarLogo = () => {
            const actual = logoNuevo === undefined ? e.logo : logoNuevo;
            vistaLogo.replaceChildren(actual ? crear("img", { src: actual, alt: "Logo" }) : crear("span", { class: "perfil-logo-vacio", text: iniciales(borrador.nombre || e.nombre) }));
            quitar.hidden = !actual;
            subirTexto.textContent = actual ? "Cambiar logo" : "Subir logo";
        };
        const archivo = crear("input", { type: "file", accept: "image/png,image/jpeg,image/webp", class: "solo-lectores", tabindex: "-1" });
        const subirTexto = crear("span", { text: "Subir logo" });
        const subir = boton("boton boton-claro boton-chico", [iconoFijo("subir"), subirTexto], () => archivo.click(), { "data-foco": "logo" });
        archivo.addEventListener("change", async () => {
            const f = archivo.files[0];
            archivo.value = "";
            if (!f) return;
            if (!/^image\/(png|jpeg|webp)$/.test(f.type)) { fallo(form, "El logo tiene que ser una imagen PNG, JPG o WebP."); return; }
            const url = URL.createObjectURL(f);
            const d = await achicarImagen(url).catch(() => null);
            URL.revokeObjectURL(url);
            if (!d) { fallo(form, "No pudimos usar esa imagen. Prueba con otra."); return; }
            fallo(form, "");
            logoNuevo = d;
            pintarLogo();
        });
        // Arrastrar una imagen sobre el logo también sirve.
        vistaLogo.addEventListener("dragover", (ev) => { ev.preventDefault(); vistaLogo.classList.add("soltando"); });
        vistaLogo.addEventListener("dragleave", () => vistaLogo.classList.remove("soltando"));
        vistaLogo.addEventListener("drop", (ev) => {
            ev.preventDefault();
            vistaLogo.classList.remove("soltando");
            if (ev.dataTransfer.files[0]) { const dt = new DataTransfer(); dt.items.add(ev.dataTransfer.files[0]); archivo.files = dt.files; archivo.dispatchEvent(new Event("change")); }
        });

        const nombre = crear("input", { id: "pe-nombre", maxlength: 120, autocomplete: "organization", value: borrador.nombre });
        nombre.addEventListener("input", () => { borrador.nombre = nombre.value; nombre.removeAttribute("aria-invalid"); if (logoNuevo === undefined && !e.logo) pintarLogo(); });

        // Página web: con un toque busca las redes que tiene enlazadas y llena las vacías.
        const web = crear("input", { id: "pe-web", type: "url", inputmode: "url", maxlength: 200, placeholder: "tuempresa.com", value: e.redes.web ? textoRed("web", e.redes.web) : "", "data-foco": "web" });
        const notaWeb = crear("p", { class: "campo-ayuda", role: "status", text: "Si tienes página, buscamos ahí tus redes y las llenamos por ti." });
        const buscarRedes = boton("boton boton-claro boton-chico", [iconoFijo("chispa"), crear("span", { text: "Buscar mis redes" })], async () => {
            const url = web.value.trim();
            if (!url) { web.focus(); return; }
            buscarRedes.disabled = true;
            notaWeb.textContent = "Buscando en tu página…";
            const r = await llamar("perfil/redes-web", { metodo: "POST", cuerpo: { url } });
            buscarRedes.disabled = false;
            if (!r.ok || !r.datos.ok) { notaWeb.textContent = (r.datos && (r.datos.motivo || r.datos.error)) || "No pudimos abrir tu página. Escribe tus redes abajo."; return; }
            const nuevas = Object.entries(r.datos.redes || {}).filter(([id]) => entradas[id] && !entradas[id].value.trim());
            for (const [id, url2] of nuevas) { entradas[id].value = url2; entradas[id].dispatchEvent(new Event("input")); entradas[id].classList.add("recien-llenado"); }
            const nombres = nuevas.map(([id]) => REDES.find((x) => x[0] === id)?.[1]).filter(Boolean);
            notaWeb.textContent = nombres.length ? `Listo: encontramos tu ${nombres.join(", ").replace(/, ([^,]*)$/, " y $1")}. Revísalas y guarda.` : "No encontramos redes enlazadas en tu página. Escríbelas abajo.";
            if (entradas.instagram.value.trim()) verificarIg();
        });

        // Las redes: se puede pegar el enlace de cualquiera en cualquier campo y se va al suyo.
        const entradas = {};
        const tarjetaIg = crear("div", { class: "ig-ficha", hidden: true, role: "status" });
        let igPedido = 0;
        const verificarIg = async () => {
            const v = entradas.instagram.value.trim();
            if (!v) { tarjetaIg.hidden = true; usarIg.hidden = true; return; }
            const mio = ++igPedido;
            tarjetaIg.hidden = false;
            tarjetaIg.replaceChildren(crear("span", { class: "ig-cargando", text: "Buscando tu cuenta de Instagram…" }));
            const r = await llamar("perfil/instagram", { metodo: "POST", cuerpo: { usuario: v } });
            if (mio !== igPedido) return;
            const d = r.datos || {};
            if (!r.ok || !d.ok) {
                igFicha = null;
                usarIg.hidden = true;
                tarjetaIg.replaceChildren(crear("span", { class: "ig-nota", text: d.motivo || "No pudimos revisar tu Instagram ahora. Igual lo guardamos." }));
                return;
            }
            igFicha = d;
            if (d.enlace && entradas.instagram.value !== d.enlace) entradas.instagram.value = d.enlace;
            borrador.redes.instagram = d.enlace;
            tarjetaIg.replaceChildren(
                d.foto ? crear("img", { src: d.foto, alt: "" }) : crear("span", { class: "perfil-logo-vacio", text: iniciales(d.nombre || d.usuario) }),
                crear("div", {}, [
                    crear("strong", { text: d.nombre || `@${d.usuario}` }),
                    crear("small", { text: `@${d.usuario}${d.seguidores ? ` · ${d.seguidores.toLocaleString("es-VE")} seguidores` : ""}` }),
                ]),
                crear("span", { class: "ig-ok" }, [iconoFijo("listo"), crear("span", { text: "Cuenta encontrada" })]),
            );
            usarIg.hidden = !d.foto;
            if (!web.value.trim() && d.web) { web.value = textoRed("web", d.web); borrador.redes.web = d.web; notaWeb.textContent = "Tomamos tu página web de tu Instagram."; }
        };
        const camposRed = REDES.map(([id, nombreRed, lugar]) => {
            const entrada = crear("input", { id: `pe-${id}`, maxlength: 200, placeholder: lugar, value: e.redes[id] || "", autocomplete: "off", spellcheck: false, "data-foco": `red-${id}` });
            entradas[id] = entrada;
            const nota = crear("p", { class: "campo-ayuda campo-movido", role: "status" });
            entrada.addEventListener("input", () => {
                entrada.removeAttribute("aria-invalid");
                const v = entrada.value.trim();
                const red = redDeEnlace(v);
                if (red && red !== id && entradas[red] && !entradas[red].value.trim()) {
                    entradas[red].value = v;
                    borrador.redes[red] = v;
                    entrada.value = "";
                    borrador.redes[id] = "";
                    nota.textContent = `Ese enlace es de ${REDES.find((x) => x[0] === red)[1]}: lo pusimos en su lugar.`;
                    entradas[red].classList.add("recien-llenado");
                    if (red === "instagram") verificarIg();
                    return;
                }
                nota.textContent = "";
                borrador.redes[id] = v;
            });
            if (id === "instagram") {
                let t = 0;
                entrada.addEventListener("input", () => { clearTimeout(t); t = setTimeout(verificarIg, 900); });
            }
            return crear("div", { class: "campo campo-red" }, [
                crear("label", { for: `pe-${id}` }, [iconoFijo(id), crear("span", { text: nombreRed })]), entrada, nota,
                ...(id === "instagram" ? [tarjetaIg] : []),
            ]);
        });
        web.addEventListener("input", () => { borrador.redes.web = web.value.trim(); web.removeAttribute("aria-invalid"); });

        form.replaceChildren(
            crear("div", { class: "empresa-cabeza" }, [crear("h2", { class: "perfil-titulo", text: "Editar mi empresa" })]),
            crear("div", { class: "empresa-form-identidad" }, [
                crear("div", { class: "editor-logo" }, [vistaLogo, crear("div", { class: "editor-logo-acciones" }, [subir, usarIg, quitar, archivo,
                    crear("p", { class: "campo-ayuda", text: "PNG, JPG o WebP. También puedes arrastrarla aquí." })])]),
                crear("div", { class: "campo" }, [crear("label", { for: "pe-nombre", text: "Nombre del cliente" }), nombre,
                    crear("p", { class: "campo-ayuda", text: "Como te conocen tus clientes. Las razones sociales van en su pestaña." })]),
            ]),
            crear("div", { class: "campo campo-web" }, [
                crear("label", { for: "pe-web" }, [iconoFijo("web"), crear("span", { text: "Página web" })]),
                crear("div", { class: "campo-con-boton" }, [web, buscarRedes]), notaWeb,
            ]),
            crear("div", { class: "editor-redes" }, camposRed),
            crear("p", { class: "cuenta-fallo", role: "alert", hidden: true }),
            crear("div", { class: "form-pie" }, [
                boton("boton boton-claro", ["Cancelar"], () => pintarEmpresa()),
                crear("button", { type: "submit", class: "boton boton-tinta cuenta-boton" }, [crear("span", { class: "cuenta-boton-texto", text: "Guardar" }), crear("span", { class: "cuenta-girando", "aria-hidden": "true" })]),
            ]),
        );
        pintarLogo();
        form.addEventListener("submit", async (ev) => {
            ev.preventDefault();
            fallo(form, "");
            if (borrador.nombre.trim().length < 2) { nombre.setAttribute("aria-invalid", "true"); fallo(form, "Escribe el nombre del cliente o de la empresa."); nombre.focus(); return; }
            const datos = datosDe(editable);
            datos.nombre = borrador.nombre;
            datos.redes = Object.fromEntries(Object.entries(borrador.redes).filter(([, v]) => String(v || "").trim()));
            ocupado(form, true, "Guardando…");
            const r = await guardar(datos, logoNuevo);
            ocupado(form, false, "Guardar");
            if (!r.ok) {
                fallo(form, r.error);
                const m = r.campo.match(/^redes\.(\w+)$/);
                const campo = r.campo === "nombre" ? nombre : r.campo === "logo" ? subir : m ? (m[1] === "web" ? web : entradas[m[1]]) : null;
                if (campo) { campo.setAttribute("aria-invalid", "true"); campo.focus(); }
                else if (/^razones/.test(r.campo)) abrirDesdeError(r);
                return;
            }
            pintarEmpresa();
            avisoListo("Guardamos tu empresa");
        });
        $(".perfil-empresa").replaceChildren(form);
        const foco = enfocar && $(`[data-foco="${enfocar}"]`, form);
        (foco || nombre).focus({ preventScroll: true });
        form.scrollIntoView({ behavior: P.QUIETO ? "auto" : "smooth", block: "start" });
        if (entradas.instagram.value.trim()) verificarIg();
    }

    /* ---- Razones sociales y sucursales */
    const pintarRazones = () => {
        const reg = new Set(editable.registrados);
        const total = editable.razones.reduce((a, r) => a + r.sucursales.length, 0);
        $(".pt-n").textContent = String(total);
        const unica = editable.razones.length <= 1;
        $(".perfil-razones").replaceChildren(
            ...editable.razones.map((r, i) => {
                const registrada = reg.has(claveRif(r.rif));
                return crear("article", { class: "tarjeta-perfil perfil-razon" }, [
                    crear("header", { class: "perfil-razon-cabeza" }, [
                        crear("span", { class: "razon-icono", "aria-hidden": "true" }, [iconoFijo("edificio")]),
                        crear("div", { class: "razon-texto" }, [
                            crear("h3", { class: "perfil-razon-nombre", text: r.razon }),
                            crear("p", { class: "perfil-rif" }, [crear("span", { text: r.rif }),
                                crear("span", { class: `garantia ${registrada ? "garantia-ok" : "garantia-neutra"}`, text: registrada ? "Registrada en SUPRICOM" : "Por confirmar con tu vendedor" })]),
                        ]),
                        crear("div", { class: "razon-acciones" }, [
                            boton("boton-quitar", [iconoFijo("editar")], () => abrirRazon(i), { "aria-label": `Editar ${r.razon}`, title: "Editar" }),
                            boton("boton-quitar", [iconoFijo("quitar")], () => quitarRazon(i), { "aria-label": `Quitar ${r.razon}`, title: unica ? "Tiene que quedar al menos una razón social" : "Quitar", disabled: unica }),
                        ]),
                    ]),
                    crear("div", { class: "perfil-sucursales" }, [
                        ...r.sucursales.map((s, j) => crear("div", { class: "perfil-sucursal" }, [
                            typeof s.lat === "number" ? miniMapa(s.lat, s.lng)
                                : boton("mini-mapa mini-mapa-vacio", [iconoFijo("lugar"), crear("span", { text: "Ubicar en el mapa" })], () => abrirSucursal(i, j)),
                            crear("div", { class: "sucursal-texto" }, [
                                crear("div", { class: "sucursal-cabeza" }, [
                                    crear("strong", { text: s.nombre }),
                                    crear("span", { class: "sucursal-acciones" }, [
                                        boton("boton-quitar", [iconoFijo("editar")], () => abrirSucursal(i, j), { "aria-label": `Editar la sucursal ${s.nombre}`, title: "Editar" }),
                                        boton("boton-quitar", [iconoFijo("quitar")], () => quitarSucursal(i, j), { "aria-label": `Quitar la sucursal ${s.nombre}`, disabled: r.sucursales.length <= 1, title: r.sucursales.length <= 1 ? "Cada razón social necesita al menos una sucursal" : "Quitar" }),
                                    ]),
                                ]),
                                crear("p", { class: "perfil-linea" }, [iconoFijo("lugar"), crear("span", { text: s.direccion || "Falta la dirección" })]),
                                crear("p", { class: "perfil-linea" }, [iconoFijo("persona"), crear("span", { text: s.contacto || "Falta el contacto" })]),
                                s.telefono ? crear("p", { class: "perfil-linea" }, [iconoFijo("telefono"), crear("a", { href: `tel:${s.telefono.replace(/[^\d+]/g, "")}`, text: s.telefono })]) : crear("span"),
                            ]),
                        ])),
                        boton("perfil-sucursal sucursal-nueva", [iconoFijo("mas"), crear("span", { text: "Agregar sucursal" })], () => abrirSucursal(i, null)),
                    ]),
                ]);
            }),
            boton("boton-agregar boton-agregar-razon", [iconoFijo("mas"), crear("span", { text: "Agregar otra razón social" })], () => abrirRazon(null)),
        );
    };

    /* ---- Diálogo: editar una razón social o una sucursal (con mapa), o confirmar */
    const dialogo = $(".perfil-dialogo");
    let alCerrarDialogo = null;
    dialogo.addEventListener("close", () => { const f = alCerrarDialogo; alCerrarDialogo = null; if (f) f(); });
    dialogo.addEventListener("click", (ev) => { if (ev.target === dialogo) dialogo.close(); }); // tocar afuera
    const abrirDialogo = (titulo, cuerpo, { ancho = false } = {}) => {
        dialogo.classList.toggle("dialogo-ancho", ancho);
        dialogo.replaceChildren(crear("div", { class: "pd-caja" }, [
            crear("div", { class: "pd-cabeza" }, [
                crear("h2", { id: "pd-titulo", class: "pd-titulo", text: titulo }),
                boton("boton-quitar", [iconoFijo("cerrar")], () => dialogo.close(), { "aria-label": "Cerrar" }),
            ]),
            cuerpo,
        ]));
        if (!dialogo.open) dialogo.showModal();
    };
    const confirmar = (texto, si) => new Promise((ok) => {
        let respuesta = false;
        abrirDialogo("¿Seguro?", crear("div", { class: "pd-cuerpo" }, [
            crear("p", { text: texto }),
            crear("div", { class: "form-pie" }, [
                boton("boton boton-claro", ["No, dejarla"], () => dialogo.close()),
                boton("boton boton-peligro", [si], () => { respuesta = true; dialogo.close(); }),
            ]),
        ]));
        alCerrarDialogo = () => ok(respuesta);
    });

    const campo = (id, etiqueta, entrada, ayuda) => crear("div", { class: "campo" }, [
        crear("label", { for: id, text: etiqueta }), entrada, crear("p", { class: "campo-error", role: "alert", hidden: true }), ...(ayuda ? [crear("p", { class: "campo-ayuda", text: ayuda })] : []),
    ]);
    const marcarError = (entrada, texto) => {
        const c = entrada.closest(".campo");
        const e = c && $(".campo-error", c);
        entrada.setAttribute("aria-invalid", "true");
        if (e) { e.textContent = texto; e.hidden = false; }
    };
    const limpiarError = (entrada) => {
        entrada.removeAttribute("aria-invalid");
        const e = entrada.closest(".campo") && $(".campo-error", entrada.closest(".campo"));
        if (e) e.hidden = true;
    };

    // El formulario de una sucursal: buscador de direcciones, «Usar mi ubicación», mapa con pin y los datos.
    const formSucursal = (s, prefijoId) => {
        const punto = { lat: typeof s.lat === "number" ? s.lat : null, lng: typeof s.lng === "number" ? s.lng : null };
        let direccionAuto = !s.direccion;
        const nombre = crear("input", { id: `${prefijoId}-nombre`, maxlength: 80, value: s.nombre, placeholder: "Principal, Centro, Almacén…" });
        const direccion = crear("textarea", { id: `${prefijoId}-direccion`, rows: 2, maxlength: 300, placeholder: "Calle, edificio o local, ciudad y estado", autocomplete: "street-address" });
        direccion.value = s.direccion || "";
        const contacto = crear("input", { id: `${prefijoId}-contacto`, maxlength: 80, value: s.contacto, autocomplete: "name", placeholder: "Quién recibe o atiende" });
        const telefono = crear("input", { id: `${prefijoId}-telefono`, type: "tel", inputmode: "tel", maxlength: 30, value: s.telefono, autocomplete: "tel", placeholder: "0414-1234567" });
        for (const x of [nombre, direccion, contacto, telefono]) x.addEventListener("input", () => limpiarError(x));
        direccion.addEventListener("input", () => { direccionAuto = false; sugerencia.hidden = true; });

        const sugerencia = crear("div", { class: "dir-sugerencia", hidden: true });
        const ofrecerDireccion = (texto) => {
            if (!texto) return;
            if (direccionAuto || !direccion.value.trim()) { direccion.value = texto; direccionAuto = true; limpiarError(direccion); sugerencia.hidden = true; return; }
            if (texto === direccion.value.trim()) return;
            sugerencia.replaceChildren(crear("span", { text: `¿Usar «${texto}»?` }), boton("enlace-chico", ["Usar esta dirección"], () => { direccion.value = texto; direccionAuto = true; sugerencia.hidden = true; }));
            sugerencia.hidden = false;
        };

        // Mapa
        const caja = crear("div", { class: "pd-mapa", "aria-label": "Mapa: toca para marcar dónde está la sucursal" });
        const estado = crear("p", { class: "campo-ayuda pd-mapa-estado", role: "status", text: punto.lat !== null ? "Puedes mover el pin si no quedó exacto." : "Busca la dirección, usa tu ubicación o toca el mapa." });
        let mapa = null;
        let pin = null;
        const marcar = (lat, lng, { centrar = true, buscarDireccion = true } = {}) => {
            punto.lat = redondeo(lat);
            punto.lng = redondeo(lng);
            quitarPunto.hidden = false;
            estado.textContent = "Listo. Puedes mover el pin si no quedó exacto.";
            if (mapa && window.L) {
                if (!pin) {
                    pin = window.L.marker([lat, lng], { draggable: true, icon: window.L.divIcon({ className: "pin-leaflet", html: '<span class="pin-mapa"></span>', iconSize: [30, 40], iconAnchor: [15, 38] }) }).addTo(mapa);
                    pin.on("dragend", () => { const p = pin.getLatLng(); marcar(p.lat, p.lng, { centrar: false }); });
                } else pin.setLatLng([lat, lng]);
                if (centrar) mapa.setView([lat, lng], Math.max(mapa.getZoom(), 16));
            }
            if (buscarDireccion) lugarDe(lat, lng).then(ofrecerDireccion);
        };
        const quitarPunto = boton("enlace-chico", ["Quitar la ubicación"], () => {
            punto.lat = punto.lng = null;
            if (pin) { pin.remove(); pin = null; }
            quitarPunto.hidden = true;
            estado.textContent = "Sin ubicación. Busca la dirección, usa tu ubicación o toca el mapa.";
        }, { hidden: punto.lat === null });
        const iniciarMapa = async () => {
            const L = await cargarLeaflet();
            if (!L) { caja.replaceChildren(crear("p", { class: "pd-mapa-sin", text: "No pudimos cargar el mapa. Escribe la dirección abajo." })); return; }
            const sedeId = (P.sede && P.sede.id) || "valencia";
            const centro = punto.lat !== null ? [punto.lat, punto.lng] : CENTRO_SEDE[sedeId] || CENTRO_SEDE.valencia;
            mapa = L.map(caja, { zoomControl: true, attributionControl: true }).setView(centro, punto.lat !== null ? 17 : 12);
            L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(mapa);
            mapa.on("click", (ev) => marcar(ev.latlng.lat, ev.latlng.lng, { centrar: false }));
            if (punto.lat !== null) marcar(punto.lat, punto.lng, { buscarDireccion: false });
            setTimeout(() => mapa.invalidateSize(), 60);
        };

        // Buscador de direcciones
        const buscar = crear("input", { type: "search", id: `${prefijoId}-buscar`, placeholder: "Busca la dirección: «Av. Bolívar Norte, Valencia»", autocomplete: "off", role: "combobox", "aria-expanded": "false", "aria-controls": `${prefijoId}-lugares` });
        const lista = crear("ul", { class: "dir-resultados", id: `${prefijoId}-lugares`, role: "listbox", hidden: true });
        let tBuscar = 0;
        let pedidoBuscar = 0;
        buscar.addEventListener("input", () => {
            clearTimeout(tBuscar);
            const q = buscar.value.trim();
            if (q.length < 4) { lista.hidden = true; buscar.setAttribute("aria-expanded", "false"); return; }
            tBuscar = setTimeout(async () => {
                const mio = ++pedidoBuscar;
                const lugares = await buscarLugares(q);
                if (mio !== pedidoBuscar) return;
                lista.replaceChildren(...(lugares.length ? lugares.map((l) => {
                    const li = crear("li", { role: "option", tabindex: "-1" }, [iconoFijo("lugar"), crear("span", {}, [crear("strong", { text: l.nombre }), crear("small", { text: l.completo })])]);
                    const elegir = () => {
                        lista.hidden = true;
                        buscar.setAttribute("aria-expanded", "false");
                        buscar.value = "";
                        marcar(l.lat, l.lng, { buscarDireccion: false });
                        ofrecerDireccion(l.nombre);
                    };
                    li.addEventListener("click", elegir);
                    li.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); elegir(); } });
                    return li;
                }) : [crear("li", { class: "dir-nada", text: "No la encontramos. Prueba con menos palabras o marca el punto en el mapa." })]));
                lista.hidden = false;
                buscar.setAttribute("aria-expanded", "true");
            }, 650);
        });
        buscar.addEventListener("keydown", (ev) => {
            if (ev.key === "ArrowDown" && !lista.hidden) { ev.preventDefault(); $("li[role=option]", lista)?.focus(); }
            if (ev.key === "Enter") ev.preventDefault();
        });
        const miUbicacion = boton("boton boton-claro boton-chico", [iconoFijo("mira"), crear("span", { text: "Usar mi ubicación" })], () => {
            if (!navigator.geolocation) { estado.textContent = "Tu navegador no da la ubicación. Busca la dirección o toca el mapa."; return; }
            estado.textContent = "Buscando dónde estás…";
            miUbicacion.disabled = true;
            navigator.geolocation.getCurrentPosition(
                (pos) => { miUbicacion.disabled = false; marcar(pos.coords.latitude, pos.coords.longitude); },
                () => { miUbicacion.disabled = false; estado.textContent = "No pudimos ver tu ubicación (revisa el permiso). Busca la dirección o toca el mapa."; },
                { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
            );
        });

        const nodo = crear("div", { class: "pd-sucursal" }, [
            crear("div", { class: "pd-buscador" }, [
                crear("div", { class: "tienda-buscar pd-buscar" }, [iconoFijo("buscar"), crear("label", { class: "solo-lectores", for: `${prefijoId}-buscar`, text: "Buscar la dirección" }), buscar]),
                miUbicacion,
                lista,
            ]),
            caja,
            crear("div", { class: "pd-mapa-pie" }, [estado, quitarPunto]),
            crear("div", { class: "editor-rejilla" }, [
                campo(`${prefijoId}-nombre`, "Nombre de la sucursal", nombre),
                campo(`${prefijoId}-telefono`, "Número de contacto", telefono),
                campo(`${prefijoId}-contacto`, "Nombre de contacto", contacto),
                crear("div", { class: "campo campo-ancho" }, [
                    crear("label", { for: `${prefijoId}-direccion`, text: "Dirección" }), direccion, sugerencia,
                    crear("p", { class: "campo-error", role: "alert", hidden: true }),
                ]),
            ]),
        ]);
        const leer = () => ({
            nombre: nombre.value.trim(), direccion: direccion.value.trim(), contacto: contacto.value.trim(), telefono: telefono.value.trim(),
            ...(punto.lat !== null ? { lat: punto.lat, lng: punto.lng } : {}),
        });
        // Lo mínimo se revisa aquí, con el mensaje en su campo; el servidor revisa todo.
        const revisar = () => {
            const v = leer();
            const errores = [];
            if (v.nombre.length < 2) errores.push([nombre, "Ponle un nombre (por ejemplo «Principal»)"]);
            if (v.telefono.replace(/\D/g, "").length < 7) errores.push([telefono, "Necesita al menos 7 números"]);
            if (v.contacto.length < 2) errores.push([contacto, "¿A quién buscamos en esta sucursal?"]);
            if (v.direccion.length < 8) errores.push([direccion, "Escribe la dirección o márcala en el mapa"]);
            for (const [x, t] of errores) marcarError(x, t);
            if (errores.length) errores[0][0].focus();
            return !errores.length;
        };
        const campoPorNombre = { nombre, direccion, contacto, telefono };
        return { nodo, leer, revisar, iniciarMapa, campoPorNombre };
    };

    // De quién copiar el contacto en una sucursal nueva: la primera de esa razón social, o la primera que haya.
    const contactoBase = (i) => {
        const s = editable.razones[i]?.sucursales[0] || editable.razones.flatMap((r) => r.sucursales)[0];
        return { contacto: s?.contacto || (datosYo?.cliente?.nombre || "").replace(/\b\w/g, (m) => m.toUpperCase()).replace(/\B\w+/g, (m) => m.toLowerCase()), telefono: s?.telefono || "" };
    };

    // `aviso`: el error del servidor que llevó a abrirla ({error, campo}); se muestra en su campo.
    function abrirSucursal(i, j, aviso) {
        const r = editable.razones[i];
        const nueva = j === null;
        const s = nueva ? { nombre: r.sucursales.length ? `Sucursal ${r.sucursales.length + 1}` : "Principal", direccion: "", ...contactoBase(i) } : r.sucursales[j];
        const f = formSucursal(s, "pd");
        const form = crear("form", { class: "pd-cuerpo", novalidate: true }, [
            crear("p", { class: "pd-sobre", text: r.razon }),
            f.nodo,
            crear("p", { class: "cuenta-fallo", role: "alert", hidden: true }),
            crear("div", { class: "form-pie" }, [
                boton("boton boton-claro", ["Cancelar"], () => dialogo.close()),
                crear("button", { type: "submit", class: "boton boton-tinta cuenta-boton" }, [crear("span", { class: "cuenta-boton-texto", text: nueva ? "Agregar sucursal" : "Guardar" }), crear("span", { class: "cuenta-girando", "aria-hidden": "true" })]),
            ]),
        ]);
        form.addEventListener("submit", async (ev) => {
            ev.preventDefault();
            fallo(form, "");
            if (!f.revisar()) return;
            const datos = datosDe(editable);
            const jj = nueva ? datos.razones[i].sucursales.length : j;
            datos.razones[i].sucursales[jj] = f.leer();
            ocupado(form, true, "Guardando…");
            const res = await guardar(datos);
            ocupado(form, false, nueva ? "Agregar sucursal" : "Guardar");
            if (!res.ok) {
                const m = res.campo.match(/^razones\.(\d+)\.sucursales\.(\d+)\.(\w+)$/);
                if (m && Number(m[1]) === i && Number(m[2]) === jj && f.campoPorNombre[m[3]]) { marcarError(f.campoPorNombre[m[3]], res.error); f.campoPorNombre[m[3]].focus(); return; }
                fallo(form, res.error);
                if (m || /^razones\.\d+\.(razon|rif)$/.test(res.campo)) ofrecerCorregir(form, res);
                return;
            }
            dialogo.close();
            avisoListo($(".empresa-form") ? "Listo. Ahora guarda los cambios de tu empresa" : nueva ? "Agregamos la sucursal" : "Guardamos la sucursal");
            if ($(".empresa-form")) irPestanaPerfil("empresa");
        });
        abrirDialogo(nueva ? "Nueva sucursal" : `Sucursal ${s.nombre}`, form, { ancho: true });
        f.iniciarMapa();
        (nueva ? $("#pd-buscar", form) : null)?.focus();
        if (aviso) {
            const c = (aviso.campo.match(/\.(\w+)$/) || [])[1];
            if (c && f.campoPorNombre[c]) { marcarError(f.campoPorNombre[c], aviso.error); f.campoPorNombre[c].focus({ preventScroll: true }); }
            else fallo(form, aviso.error);
        }
    }

    function abrirRazon(i, aviso) {
        const nueva = i === null;
        const r = nueva ? { razon: "", rif: "" } : editable.razones[i];
        const razon = crear("input", { id: "pr-razon", maxlength: 160, value: r.razon, autocomplete: "organization", placeholder: "Como aparece en el RIF" });
        const rif = crear("input", { id: "pr-rif", maxlength: 25, value: r.rif, placeholder: "J-12345678-9", spellcheck: false, autocomplete: "off", class: "entrada-rif" });
        const notaRif = crear("p", { class: "campo-ayuda", role: "status" });
        // Si el RIF es de una de sus empresas en Odoo, el nombre se llena solo.
        rif.addEventListener("input", () => {
            limpiarError(rif);
            const conocida = (editable.conocidas || []).find((c) => claveRif(c.rif) === claveRif(rif.value));
            if (conocida && !razon.value.trim()) { razon.value = conocida.razon; limpiarError(razon); notaRif.textContent = "La reconocimos: ya está registrada con nosotros."; }
            else notaRif.textContent = "";
        });
        rif.addEventListener("blur", () => { rif.value = formatearRif(rif.value); });
        razon.addEventListener("input", () => limpiarError(razon));
        const f = nueva ? formSucursal({ nombre: "Principal", direccion: "", ...contactoBase(0) }, "pn") : null;
        const form = crear("form", { class: "pd-cuerpo", novalidate: true }, [
            crear("div", { class: "editor-rejilla" }, [campo("pr-rif", "RIF / RUC", rif), campo("pr-razon", "Razón social", razon)]),
            notaRif,
            ...(f ? [crear("h3", { class: "pd-sub", text: "Su sucursal principal" }), f.nodo] : []),
            crear("p", { class: "cuenta-fallo", role: "alert", hidden: true }),
            crear("div", { class: "form-pie" }, [
                boton("boton boton-claro", ["Cancelar"], () => dialogo.close()),
                crear("button", { type: "submit", class: "boton boton-tinta cuenta-boton" }, [crear("span", { class: "cuenta-boton-texto", text: nueva ? "Agregar razón social" : "Guardar" }), crear("span", { class: "cuenta-girando", "aria-hidden": "true" })]),
            ]),
        ]);
        form.addEventListener("submit", async (ev) => {
            ev.preventDefault();
            fallo(form, "");
            rif.value = formatearRif(rif.value);
            let bien = true;
            if (claveRif(rif.value).length < 6) { marcarError(rif, "Escribe el RIF, por ejemplo J-12345678-9"); bien = false; }
            if (razon.value.trim().length < 2) { marcarError(razon, "Escribe la razón social"); bien = false; }
            if (f && !f.revisar()) bien = false;
            if (!bien) { $("[aria-invalid=true]", form)?.focus(); return; }
            const datos = datosDe(editable);
            const ii = nueva ? datos.razones.length : i;
            if (nueva) datos.razones.push({ razon: razon.value.trim(), rif: rif.value.trim(), sucursales: [f.leer()] });
            else { datos.razones[ii].razon = razon.value.trim(); datos.razones[ii].rif = rif.value.trim(); }
            ocupado(form, true, "Guardando…");
            const res = await guardar(datos);
            ocupado(form, false, nueva ? "Agregar razón social" : "Guardar");
            if (!res.ok) {
                const m = res.campo.match(/^razones\.(\d+)\.(razon|rif)$/);
                if (m && Number(m[1]) === ii) { const x = m[2] === "rif" ? rif : razon; marcarError(x, res.error); x.focus(); return; }
                const ms = res.campo.match(/^razones\.(\d+)\.sucursales\.0\.(\w+)$/);
                if (f && ms && Number(ms[1]) === ii && f.campoPorNombre[ms[2]]) { marcarError(f.campoPorNombre[ms[2]], res.error); f.campoPorNombre[ms[2]].focus(); return; }
                fallo(form, res.error);
                ofrecerCorregir(form, res);
                return;
            }
            dialogo.close();
            avisoListo(nueva ? "Agregamos la razón social" : "Guardamos la razón social");
        });
        abrirDialogo(nueva ? "Nueva razón social" : "Editar razón social", form, { ancho: nueva });
        if (f) f.iniciarMapa();
        rif.focus();
        if (aviso) {
            const x = /\.rif$/.test(aviso.campo) ? rif : /\.razon$/.test(aviso.campo) ? razon : null;
            if (x) { marcarError(x, aviso.error); x.focus(); } else fallo(form, aviso.error);
        }
    }

    // Si lo que no deja guardar es otra sucursal (por ejemplo una que vino de Odoo sin dirección), se ofrece ir a ella.
    const ofrecerCorregir = (form, res) => {
        const m = res.campo.match(/^razones\.(\d+)(?:\.sucursales\.(\d+))?/);
        if (!m) return;
        const i = Number(m[1]);
        const j = m[2] !== undefined ? Number(m[2]) : null;
        if (!editable.razones[i]) return;
        const pie = $(".cuenta-fallo", form);
        pie.append(" ", boton("enlace-chico", ["Corregirla ahora"], () => (j !== null ? abrirSucursal(i, j, res) : abrirRazon(i, res))));
    };
    const abrirDesdeError = (res) => {
        const m = res.campo.match(/^razones\.(\d+)(?:\.sucursales\.(\d+))?/);
        if (!m || !editable.razones[Number(m[1])]) return;
        irPestanaPerfil("sucursales");
        if (m[2] !== undefined) abrirSucursal(Number(m[1]), Number(m[2]), res); else abrirRazon(Number(m[1]), res);
    };

    const quitarSucursal = async (i, j) => {
        const s = editable.razones[i].sucursales[j];
        if (!(await confirmar(`Vamos a quitar la sucursal «${s.nombre}» de ${editable.razones[i].razon}.`, "Sí, quitarla"))) return;
        const datos = datosDe(editable);
        datos.razones[i].sucursales.splice(j, 1);
        const r = await guardar(datos);
        if (r.ok) avisoListo("Quitamos la sucursal"); else { avisar(r.error); abrirDesdeError(r); }
    };
    const quitarRazon = async (i) => {
        const r0 = editable.razones[i];
        if (!(await confirmar(`Vamos a quitar la razón social «${r0.razon}» (${r0.rif}) con sus ${r0.sucursales.length} ${r0.sucursales.length === 1 ? "sucursal" : "sucursales"}.`, "Sí, quitarla"))) return;
        const datos = datosDe(editable);
        datos.razones.splice(i, 1);
        const r = await guardar(datos);
        if (r.ok) avisoListo("Quitamos la razón social"); else { avisar(r.error); abrirDesdeError(r); }
    };

    // La primera vez el perfil es una propuesta con lo de Odoo: «Confirmar» la guarda tal cual (o lleva a lo que falte).
    const confirmarPropuesta = async () => {
        const r = await guardar(datosDe(editable));
        if (r.ok) { avisoListo("Listo, guardamos tus datos"); return; }
        avisar(r.error);
        abrirDesdeError(r);
    };

    const pintarSedes = (d) => {
        $(".perfil-sedes").replaceChildren(...(d.sedes.length ? d.sedes.map((s) => {
            const v = s.vendedor;
            const wa = v ? enlaceWhatsapp(v.telefono) : "";
            return crear("article", { class: "tarjeta-perfil perfil-sede" }, [
                crear("p", { class: "tarjeta-titulo", text: `Sede ${s.sede.nombre}` }),
                v ? crear("div", { class: "vendedor" }, [
                    crear("span", { class: "vendedor-avatar", "aria-hidden": "true", text: iniciales(v.nombre) }),
                    crear("div", {}, [crear("strong", { text: v.nombre }), crear("small", { text: "Tu vendedor" })]),
                ]) : crear("p", { class: "tarjeta-nota", text: "Todavía no tienes un vendedor asignado en esta sede." }),
                v ? crear("div", { class: "vendedor-contacto" }, [
                    ...(v.correo ? [crear("a", { class: "boton boton-claro", href: `mailto:${v.correo}`, text: "Correo" })] : []),
                    ...(wa ? [crear("a", { class: "boton boton-tinta", href: wa, target: "_blank", rel: "noopener", text: "WhatsApp" })] : []),
                ]) : crear("span"),
                crear("dl", { class: "perfil-datos perfil-datos-compactos" }, filasDatos([
                    ["Plazo de pago", s.plazo || "De contado"], ["Cupo de crédito", s.cupo > 0 ? dinero(s.cupo) : "Sin cupo asignado"],
                ])),
            ]);
        }) : [crear("p", { class: "lista-vacia", text: "Todavía no hay compras a tu nombre en ninguna sede." })]));
    };

    // Si «Editar mi empresa» está abierto (por ejemplo, se fue a corregir una sucursal), no se pierde lo escrito.
    const pintarTodo = () => {
        pintarHero();
        if (!$(".empresa-form")) pintarEmpresa();
        pintarRazones();
    };

    const cargarPerfil = async () => {
        $(".perfil-hero").replaceChildren(crear("div", { class: "perfil-hero-esqueleto esqueleto", "aria-hidden": "true" }));
        $(".perfil-razones").replaceChildren(crear("div", { class: "tarjeta-perfil esqueleto", "aria-hidden": "true" }));
        $(".perfil-sedes").replaceChildren(crear("div", { class: "tarjeta-perfil esqueleto", "aria-hidden": "true" }));
        const r = await llamar("perfil");
        if (!r.ok) { if (r.status !== 401) avisar(r.datos.error || "No pudimos leer tu perfil."); return; }
        const d = (perfilDatos = r.datos);
        editable = d.editable;
        pintarTodo();
        pintarSedes(d);
        pintarAvatar(editable.guardado ? editable.logo : null, editable.nombre);
        $(".perfil-acceso-datos").replaceChildren(...filasDatos([
            ["Correo de acceso", d.acceso.correo], ["Cuenta creada", fecha(d.acceso.creado)],
            ["Último ingreso", d.acceso.ultimoIngreso ? `${fecha(d.acceso.ultimoIngreso)} · ${d.acceso.ultimoIngreso.slice(11, 16)}` : ""],
            ["Contraseña cambiada", fecha(d.acceso.claveCambiada)],
        ]));
        const tel = editable.razones[0]?.sucursales[0]?.telefono || d.empresa.telefono;
        if (!$("#rma-telefono").value && tel) $("#rma-telefono").value = tel;
    };
    const formClaveNueva = $(".perfil-clave");
    formClaveNueva.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const actual = formClaveNueva.actual.value;
        const nueva = formClaveNueva.nueva.value;
        const r0 = reglas(nueva);
        const f = $(".cuenta-fallo", formClaveNueva);
        f.classList.remove("cuenta-ok");
        if (!actual) { fallo(formClaveNueva, "Escribe tu contraseña actual."); return; }
        if (!r0.largo || !r0.mezcla) { fallo(formClaveNueva, "La contraseña nueva necesita al menos 8 caracteres, con letras y números."); return; }
        ocupado(formClaveNueva, true, "Guardando…");
        let recordar = true;
        try { recordar = Boolean(localStorage.getItem(CLAVE)); } catch (e) { /* */ }
        const r = await llamar("cambiar-clave", { metodo: "POST", cuerpo: { actual, nueva, recordar } });
        ocupado(formClaveNueva, false, "Guardar contraseña");
        if (r.ok && r.datos.token) {
            guardarToken(r.datos.token, recordar);
            formClaveNueva.reset();
            fallo(formClaveNueva, "Listo: tu contraseña cambió y cerramos tu sesión en los otros equipos.");
            f.classList.add("cuenta-ok");
            return;
        }
        fallo(formClaveNueva, r.datos.error || "No pudimos cambiar tu contraseña.");
    });

    $(".perfil-salir-todos").addEventListener("click", async () => {
        await llamar("salir", { metodo: "POST" });
        borrarToken();
        cargadas.clear();
        mostrarAcceso("Cerraste tu sesión en todos los equipos.");
        $(".cuenta-fallo", formEntrar).classList.add("cuenta-ok");
    });

    /* ---------------------------------------------------------------- Servicio técnico */
    const asistente = $(".rma-asistente");
    const rma = { factura: null, productos: [], elegidos: new Set(), pagina: 1, subidas: new Map() };
    const GARANTIA = {
        en_garantia: (g) => ["ok", g.vence ? `En garantía hasta ${fecha(g.vence)}` : "En garantía"],
        vencida: (g) => ["vencida", g.vence ? `Garantía vencida el ${fecha(g.vence)}` : "Garantía vencida"],
        vida_util: () => ["ok", "Garantía de por vida"],
        indeterminada: () => ["neutra", "Garantía por confirmar"],
    };
    // La foto del producto en Odoo; si no la hay (o no es pública), un recuadro vacío.
    const fotoProducto = (id) => {
        if (!id) return crear("span", { class: "foto-vacia" });
        const img = crear("img", { src: `${P.D.odoo}/web/image/product.product/${id}/image_128`, alt: "", loading: "lazy" });
        img.addEventListener("error", () => img.replaceWith(crear("span", { class: "foto-vacia" })), { once: true });
        return img;
    };
    const pasoRma = (n) => {
        for (const p of $$(".rma-paso", asistente)) p.hidden = p.dataset.rma !== String(n);
        $(".rma-listo", asistente).hidden = true;
        $(".rma-barra .rma-pasos", asistente).hidden = false;
        for (const li of $$("[data-paso-rma]", asistente)) {
            const k = Number(li.dataset.pasoRma);
            li.className = k < n ? "hecho" : k === n ? "actual" : "";
            if (k === n) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
        }
    };
    const abrirAsistente = () => {
        asistente.hidden = false;
        rma.factura = null; rma.elegidos.clear(); rma.subidas.clear();
        pasoRma(1);
        cargarFacturasRma();
        asistente.scrollIntoView({ behavior: P.QUIETO ? "auto" : "smooth", block: "start" });
        $("#rma-q").focus({ preventScroll: true });
    };
    $(".rma-nuevo").addEventListener("click", abrirAsistente);
    $(".rma-cancelar").addEventListener("click", () => { asistente.hidden = true; $(".rma-nuevo").focus(); });
    $(".rma-otro").addEventListener("click", abrirAsistente);
    for (const b of $$(".rma-atras", asistente)) b.addEventListener("click", () => pasoRma(Number(b.dataset.a)));

    let esperaRma = 0;
    $("#rma-q").addEventListener("input", () => { clearTimeout(esperaRma); esperaRma = setTimeout(() => { rma.pagina = 1; cargarFacturasRma(); }, 350); });
    const cargarFacturasRma = async () => {
        const cont = $(".rma-facturas");
        cont.replaceChildren(...esqueletoFilas(4));
        const q = new URLSearchParams({ pagina: String(rma.pagina) });
        if ($("#rma-q").value.trim()) q.set("q", $("#rma-q").value.trim());
        const r = await llamar(`rma/facturas?${q}`);
        if (!r.ok) { if (r.status !== 401) cont.replaceChildren(crear("p", { class: "lista-vacia", text: r.datos.error || "No pudimos leer tus facturas." })); return; }
        cont.replaceChildren(...(r.datos.facturas.length ? r.datos.facturas.map((f) => {
            const b = crear("button", { type: "button", class: "fila fila-rma-factura", role: "listitem" }, [
                celda("c-numero", [crear("span", { class: "c-numero-texto" }, [crear("strong", { text: f.numero }), crear("small", { text: [f.sede.nombre, f.pedido ? `Pedido ${f.pedido}` : ""].filter(Boolean).join(" · ") })])]),
                celda("c-fecha", [fecha(f.fecha)]),
                crear("span", { class: "celda c-ir", "aria-hidden": "true" }, [P.icono("ir", "icono-ir")]),
            ]);
            b.setAttribute("aria-label", `Factura ${f.numero} del ${fecha(f.fecha)}, ${f.sede.nombre}. Ver sus equipos`);
            b.addEventListener("click", () => elegirFacturaRma(f));
            return b;
        }) : [crear("p", { class: "lista-vacia", text: "No encontramos facturas con esa búsqueda en los últimos 3 años." })]));
        paginas("rma", r.datos.total, r.datos.pagina, r.datos.porPagina, (p) => { rma.pagina = p; cargarFacturasRma(); });
    };

    const elegirFacturaRma = async (f) => {
        rma.factura = f; rma.elegidos.clear();
        pasoRma(2);
        $(".rma-factura-elegida").textContent = `Factura ${f.numero} del ${fecha(f.fecha)} · ${f.sede.nombre}. Elige el equipo (o los equipos) que fallan.`;
        const cont = $(".rma-productos");
        cont.replaceChildren(...esqueletoFilas(3));
        pintarCuentaRma();
        const r = await llamar(`rma/productos?factura=${f.id}`);
        if (!r.ok) { if (r.status !== 401) cont.replaceChildren(crear("p", { class: "lista-vacia", text: r.datos.error || "No pudimos leer los equipos de esa factura." })); return; }
        rma.productos = r.datos.productos;
        cont.replaceChildren(...(rma.productos.length ? rma.productos.map((p) => {
            const [tono, texto] = (GARANTIA[p.garantia.estado] || GARANTIA.indeterminada)(p.garantia);
            const casilla = crear("input", { type: "checkbox", value: p.id });
            casilla.addEventListener("change", () => {
                if (casilla.checked) { if (rma.elegidos.size >= 10) { casilla.checked = false; return; } rma.elegidos.add(p.id); } else rma.elegidos.delete(p.id);
                tarjeta.classList.toggle("elegido", casilla.checked);
                pintarCuentaRma();
            });
            const tarjeta = crear("label", { class: "rma-producto" }, [
                casilla,
                fotoProducto(p.productoId),
                crear("span", { class: "rma-producto-texto" }, [
                    crear("strong", { text: p.nombre }),
                    crear("small", { text: [p.marca, p.codigo].filter(Boolean).join(" · ") }),
                    crear("small", { class: "rma-serial", text: p.serial ? `Serial ${p.serial}` : p.llevaSerial ? "Serial: lo escribes en el siguiente paso" : "Sin serial" }),
                ]),
                crear("span", { class: "rma-producto-estado" }, [
                    crear("span", { class: `garantia garantia-${tono}`, text: texto }),
                    ...(p.yaReportado ? [crear("span", { class: "ya-reportado", text: `Ya tiene el caso ${p.caso || ""}`.trim() })] : []),
                ]),
            ]);
            return tarjeta;
        }) : [crear("p", { class: "lista-vacia", text: "Esta factura no tiene equipos para reportar." })]));
    };
    const pintarCuentaRma = () => {
        const n = rma.elegidos.size;
        $(".rma-cuenta").textContent = n ? `${n} ${n === 1 ? "equipo elegido" : "equipos elegidos"}` : "Elige al menos un equipo";
        $(".rma-siguiente").disabled = !n;
    };
    $(".rma-siguiente").addEventListener("click", () => {
        const elegidos = rma.productos.filter((p) => rma.elegidos.has(p.id));
        const cont = $(".rma-detalles");
        cont.replaceChildren(...elegidos.map((p, i) => {
            if (!rma.subidas.has(p.id)) rma.subidas.set(p.id, { token: (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`).replace(/-/g, ""), archivos: [] });
            const sub = rma.subidas.get(p.id);
            const lista = crear("ul", { class: "rma-archivos" }, sub.archivos.map((a) => crear("li", { class: "subido", text: a })));
            const entrada = crear("input", { type: "file", accept: "image/*,video/*", multiple: true, class: "solo-lectores", id: `rma-archivo-${i}` });
            entrada.addEventListener("change", () => subirArchivos(p, entrada, lista));
            return crear("fieldset", { class: "rma-detalle", "data-item": p.id }, [
                crear("legend", {}, [crear("strong", { text: p.nombre }), crear("small", { text: p.serial ? `Serial ${p.serial}` : (p.codigo || "") })]),
                ...(p.llevaSerial && !p.serial ? [crear("div", { class: "campo" }, [
                    crear("label", { for: `rma-serial-${i}`, text: "Serial (está en la etiqueta del equipo)" }),
                    crear("input", { id: `rma-serial-${i}`, name: "serial", maxlength: 100, spellcheck: false, autocomplete: "off" }),
                ])] : []),
                crear("div", { class: "campo" }, [
                    crear("label", { for: `rma-falla-${i}`, text: "¿Qué le pasa?" }),
                    crear("textarea", { id: `rma-falla-${i}`, name: "falla", rows: 3, maxlength: 5000, placeholder: "Por ejemplo: no enciende, imprime con rayas, se reinicia solo…" }),
                ]),
                crear("div", { class: "campo" }, [
                    crear("span", { class: "rma-archivo-titulo", text: "Fotos o video de la falla (hasta 5)" }),
                    crear("label", { class: "boton boton-claro rma-archivo-boton", for: `rma-archivo-${i}` }, ["Adjuntar archivos"]),
                    entrada,
                    lista,
                ]),
                ...(p.yaReportado ? [crear("label", { class: "recordar rma-confirmar" }, [crear("input", { type: "checkbox", name: "confirmar" }), ` Sé que este equipo ya tiene el caso ${p.caso || ""} y quiero reportarlo de nuevo`])] : []),
            ]);
        }));
        pasoRma(3);
        $("textarea", cont)?.focus();
    });
    const subirArchivos = async (p, entrada, lista) => {
        const sub = rma.subidas.get(p.id);
        const archivos = [...entrada.files].slice(0, Math.max(0, 5 - sub.archivos.length));
        entrada.value = "";
        if (!archivos.length) return;
        const fila = crear("li", { class: "subiendo", text: `Subiendo ${archivos.length} ${archivos.length === 1 ? "archivo" : "archivos"}…` });
        lista.append(fila);
        const datos = new FormData();
        datos.append("tracking_token", sub.token);
        for (const a of archivos) datos.append("files", a);
        try {
            const r = await fetch(`${api}/clientes/rma/adjuntos`, { method: "POST", headers: { Authorization: `Bearer ${tokenEnMemoria}` }, body: datos, credentials: "omit" });
            const j = await r.json().catch(() => ({}));
            fila.remove();
            for (const s of j.saved || []) { sub.archivos.push(s.filename); lista.append(crear("li", { class: "subido", text: s.filename })); }
            for (const e of j.errors || []) lista.append(crear("li", { class: "fallido", text: `${e.filename}: ${e.reason}` }));
            if (!r.ok && !(j.errors || []).length) lista.append(crear("li", { class: "fallido", text: j.error || "No pudimos subir los archivos." }));
        } catch (e) {
            fila.className = "fallido";
            fila.textContent = "No pudimos subir los archivos. Revisa tu conexión.";
        }
    };
    const formRma = $('.rma-paso[data-rma="3"]');
    formRma.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        fallo(formRma, "");
        const productos = [];
        for (const caja of $$(".rma-detalle", formRma)) {
            const p = rma.productos.find((x) => x.id === caja.dataset.item);
            const falla = $("textarea", caja).value.trim();
            const serial = $('input[name="serial"]', caja)?.value.trim() || "";
            const sub = rma.subidas.get(p.id);
            if (falla.length < 10) { fallo(formRma, `Cuéntanos con más detalle qué le pasa a ${p.nombre}.`); $("textarea", caja).focus(); return; }
            if (p.llevaSerial && !p.serial && !serial) { fallo(formRma, `Escribe el serial de ${p.nombre}.`); $('input[name="serial"]', caja).focus(); return; }
            if (!sub.archivos.length) { fallo(formRma, `Adjunta al menos una foto o un video de ${p.nombre}.`); $(".rma-archivo-boton", caja).focus(); return; }
            const confirmar = $('input[name="confirmar"]', caja);
            if (confirmar && !confirmar.checked) { fallo(formRma, `${p.nombre} ya tiene un caso: confirma que quieres reportarlo de nuevo.`); confirmar.focus(); return; }
            productos.push({ item_id: p.id, serial_manual: serial, falla, upload_token: sub.token });
        }
        const telefono = $("#rma-telefono").value.trim();
        if (telefono.replace(/\D/g, "").length < 7) { fallo(formRma, "Escribe un teléfono para coordinar la entrega del equipo."); $("#rma-telefono").focus(); return; }
        ocupado(formRma, true, "Enviando…");
        const r = await llamar("rma", { metodo: "POST", cuerpo: { factura: rma.factura.id, telefono, productos } });
        ocupado(formRma, false, "Enviar reporte");
        if (!r.ok) { if (r.status !== 401) fallo(formRma, r.datos.error || "No pudimos enviar tu reporte."); return; }
        for (const p of $$(".rma-paso", asistente)) p.hidden = true;
        $(".rma-barra .rma-pasos", asistente).hidden = true;
        const listo = $(".rma-listo", asistente);
        $(".rma-listo-titulo", listo).textContent = `Listo: abrimos el caso N.º ${r.datos.numero}`;
        const seguir = $(".rma-seguir", listo);
        seguir.hidden = !r.datos.seguimiento;
        if (r.datos.seguimiento) seguir.href = r.datos.seguimiento;
        listo.hidden = false;
        listo.focus();
        rma.subidas.clear();
        cargarCasos();
    });

    const cargarCasos = async () => {
        const cont = $(".rma-casos");
        cont.replaceChildren(...esqueletoFilas(3));
        const r = await llamar("rma/casos");
        if (!r.ok) { if (r.status !== 401) cont.replaceChildren(crear("p", { class: "lista-vacia", text: r.datos.error || "No pudimos leer tus casos." })); return; }
        const casos = r.datos.casos || [];
        cont.replaceChildren(...(casos.length ? casos.map((x) => crear("div", { class: "fila fila-caso", role: "row" }, [
            celda("c-numero", [crear("span", { class: "c-numero-texto" }, [crear("strong", { text: `Caso ${x.numero}` }), crear("small", { text: [fecha(x.fecha), x.factura ? `Factura ${x.factura}` : ""].filter(Boolean).join(" · ") })])]),
            celda("c-equipos", [crear("span", { class: "c-numero-texto" }, [
                crear("strong", { text: (x.productos[0] && x.productos[0].nombre) || "Equipo" }),
                crear("small", { text: [x.productos[0] && x.productos[0].serial ? `Serial ${x.productos[0].serial}` : "", x.productos.length > 1 ? `y ${x.productos.length - 1} más` : ""].filter(Boolean).join(" · ") }),
            ])]),
            celda("c-sede", [x.sede.nombre]),
            celda("c-estado", [crear("span", { class: `insignia insignia-rma-${x.tono}`, text: x.estadoTexto })]),
            celda("c-ir", x.seguimiento ? [crear("a", { class: "enlace-chico enlace-acento", href: x.seguimiento, target: "_blank", rel: "noopener", text: "Seguir", "aria-label": `Seguir el caso ${x.numero}` })] : []),
        ])) : [crear("p", { class: "lista-vacia", text: "Todavía no tienes casos de servicio técnico." })]));
    };

    // Menú lateral en el celular: entra desde la izquierda y se cierra al elegir, con Esc o tocando afuera.
    const lado = $(".panel-lado");
    const botonMenu = $(".panel-menu");
    const celular = window.matchMedia("(max-width: 640px)");
    const menuAbierto = () => document.body.classList.contains("menu-cuenta-abierto");
    const ajustarMenu = () => { lado.inert = celular.matches && !menuAbierto(); };
    const abrirMenu = () => {
        document.body.classList.add("menu-cuenta-abierto");
        botonMenu.setAttribute("aria-expanded", "true");
        ajustarMenu();
        ($(".panel-nav [aria-selected=true]") || $(".panel-cerrar")).focus({ preventScroll: true });
    };
    const cerrarMenu = (devolverFoco = true) => {
        if (!menuAbierto()) return;
        document.body.classList.remove("menu-cuenta-abierto");
        botonMenu.setAttribute("aria-expanded", "false");
        ajustarMenu();
        if (devolverFoco) botonMenu.focus({ preventScroll: true });
    };
    botonMenu.addEventListener("click", abrirMenu);
    $(".panel-cerrar").addEventListener("click", () => cerrarMenu());
    $(".panel-lado-fondo").addEventListener("click", () => cerrarMenu());
    lado.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && menuAbierto()) { ev.preventDefault(); cerrarMenu(); } });
    celular.addEventListener("change", () => { if (!celular.matches) cerrarMenu(false); ajustarMenu(); });
    ajustarMenu();

    // Pestañas (y el enlace: #pedidos, #facturas, #rma, #perfil)
    const pestanas = $$(".panel-nav [role=tab]");
    const cargadas = new Set();
    function irVista(nombre, { foco = false, historial = true } = {}) {
        if (!["resumen", "pedidos", "facturas", "rma", "perfil"].includes(nombre)) nombre = "resumen";
        for (const t of pestanas) {
            const activa = t.dataset.vista === nombre;
            t.setAttribute("aria-selected", String(activa));
            t.tabIndex = activa ? 0 : -1;
            $(`#vista-${t.dataset.vista}`).hidden = !activa;
            if (activa && foco) t.focus();
            if (activa) $(".panel-barra-seccion").textContent = t.textContent.trim();
        }
        cerrarMenu(false);
        if (historial && location.hash !== `#${nombre}`) history.replaceState(null, "", nombre === "resumen" ? location.pathname + location.search : `#${nombre}`);
        if (nombre === "resumen" && !cargadas.has("resumen")) { cargadas.add("resumen"); cargarResumen(); }
        if (nombre === "pedidos" || nombre === "facturas") { cargadas.add(nombre); cargarLista(nombre); }
        if (nombre === "rma" && !cargadas.has("rma")) { cargadas.add("rma"); cargarCasos(); if (!cargadas.has("perfil")) { cargadas.add("perfil"); cargarPerfil(); } }
        if (nombre === "perfil" && !cargadas.has("perfil")) { cargadas.add("perfil"); cargarPerfil(); }
        window.scrollTo({ top: 0, behavior: "auto" });
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
