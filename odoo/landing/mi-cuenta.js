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
    const ICONOS_RED = {
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
    };
    const iconoFijo = (nombre, clase = "icono-linea") => {
        const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        s.setAttribute("viewBox", "0 0 24 24");
        s.setAttribute("aria-hidden", "true");
        s.setAttribute("class", clase);
        s.innerHTML = ICONOS_RED[nombre] || "";
        return s;
    };
    const REDES = [
        ["instagram", "Instagram", "@tuempresa"], ["facebook", "Facebook", "facebook.com/tuempresa"], ["tiktok", "TikTok", "@tuempresa"],
        ["x", "X (Twitter)", "@tuempresa"], ["linkedin", "LinkedIn", "linkedin.com/company/tuempresa"], ["web", "Página web", "tuempresa.com"],
    ];
    // Lo que se ve de una red: el usuario («@tienda») o el sitio sin https.
    const textoRed = (id, url) => {
        try {
            const u = new URL(url);
            if (id === "web") return (u.host + u.pathname).replace(/\/$/, "");
            const ultimo = u.pathname.split("/").filter(Boolean).pop() || u.host;
            return `@${ultimo.replace(/^@/, "")}`;
        } catch (e) { return url; }
    };
    const claveRif = (v) => String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const pintarAvatar = (logo, texto) => {
        for (const a of $$(".panel-avatar")) {
            a.classList.toggle("con-logo", Boolean(logo));
            a.style.backgroundImage = logo ? `url("${logo}")` : "";
            a.textContent = logo ? "" : iniciales(texto);
        }
    };

    let perfilDatos = null;
    let editable = null;
    const pintarHero = () => {
        const e = editable;
        const sucursales = e.razones.reduce((a, r) => a + r.sucursales.length, 0);
        const redes = REDES.filter(([id]) => e.redes[id]);
        $(".perfil-hero").replaceChildren(
            crear("div", { class: "perfil-hero-fondo", "aria-hidden": "true" }),
            crear("div", { class: "perfil-hero-cuerpo" }, [
                e.logo ? crear("img", { class: "perfil-logo", src: e.logo, alt: `Logo de ${e.nombre}` })
                    : crear("span", { class: "perfil-logo perfil-logo-vacio", "aria-hidden": "true", text: iniciales(e.nombre) }),
                crear("div", { class: "perfil-hero-texto" }, [
                    crear("p", { class: "tarjeta-titulo", text: "Cliente" }),
                    crear("h2", { class: "perfil-nombre", text: e.nombre }),
                    crear("p", { class: "tarjeta-nota", text: `${e.razones.length} ${e.razones.length === 1 ? "razón social" : "razones sociales"} · ${sucursales} ${sucursales === 1 ? "sucursal" : "sucursales"}` }),
                ]),
                redes.length
                    ? crear("ul", { class: "perfil-redes", "aria-label": "Redes sociales" }, redes.map(([id, nombre]) => crear("li", {}, [
                        crear("a", { href: e.redes[id], target: "_blank", rel: "noopener nofollow", "aria-label": `${nombre}: ${textoRed(id, e.redes[id])}`, title: textoRed(id, e.redes[id]) }, [iconoFijo(id)]),
                    ])))
                    : crear("p", { class: "perfil-sin-redes", text: "Agrega tus redes sociales en «Editar perfil»." }),
            ]),
            e.guardado
                ? crear("p", { class: "perfil-hero-pie", text: `Actualizado el ${fecha(e.actualizadoEl)} a las ${e.actualizadoEl.slice(11, 16)}${e.actualizadoPor ? ` por ${e.actualizadoPor}` : ""}` })
                : crear("div", { class: "perfil-propuesta" }, [
                    crear("p", { text: "Armamos tu perfil con los datos que tenemos de tu empresa. Revísalo, agrega tu logo, tus redes y tus sucursales, y guárdalo." }),
                    (() => { const b = crear("button", { type: "button", class: "boton boton-tinta", text: "Completar mi perfil" }); b.addEventListener("click", abrirEditor); return b; })(),
                ]),
        );
    };
    const pintarRazones = () => {
        const reg = new Set(editable.registrados);
        $(".perfil-razones").replaceChildren(...editable.razones.map((r) => {
            const registrada = reg.has(claveRif(r.rif));
            return crear("article", { class: "tarjeta-perfil perfil-razon" }, [
                crear("header", { class: "perfil-razon-cabeza" }, [
                    crear("div", {}, [
                        crear("h3", { class: "perfil-razon-nombre", text: r.razon }),
                        crear("p", { class: "perfil-rif", text: r.rif }),
                    ]),
                    crear("span", { class: `garantia ${registrada ? "garantia-ok" : "garantia-neutra"}`, text: registrada ? "Registrada en SUPRICOM" : "Por confirmar con tu vendedor" }),
                ]),
                crear("div", { class: "perfil-sucursales" }, r.sucursales.map((s) => crear("div", { class: "perfil-sucursal" }, [
                    crear("strong", { text: s.nombre }),
                    crear("p", { class: "perfil-linea" }, [iconoFijo("lugar"), crear("span", { text: s.direccion || "Sin dirección" })]),
                    crear("p", { class: "perfil-linea" }, [iconoFijo("persona"), crear("span", { text: s.contacto })]),
                    s.telefono ? crear("p", { class: "perfil-linea" }, [iconoFijo("telefono"), crear("a", { href: `tel:${s.telefono.replace(/[^\d+]/g, "")}`, text: s.telefono })]) : crear("span"),
                ]))),
            ]);
        }));
    };

    const cargarPerfil = async () => {
        $(".perfil-hero").replaceChildren(crear("div", { class: "perfil-hero-esqueleto esqueleto", "aria-hidden": "true" }));
        $(".perfil-razones").replaceChildren(crear("div", { class: "tarjeta-perfil esqueleto", "aria-hidden": "true" }));
        $(".perfil-sedes").replaceChildren(crear("div", { class: "tarjeta-perfil esqueleto", "aria-hidden": "true" }));
        const r = await llamar("perfil");
        if (!r.ok) { if (r.status !== 401) avisar(r.datos.error || "No pudimos leer tu perfil."); return; }
        const d = (perfilDatos = r.datos);
        editable = d.editable;
        cerrarEditor(false);
        pintarHero();
        pintarRazones();
        $(".perfil-editar").hidden = false;
        pintarAvatar(editable.guardado ? editable.logo : null, editable.nombre);
        $(".perfil-acceso-datos").replaceChildren(...filasDatos([
            ["Correo de acceso", d.acceso.correo], ["Cuenta creada", fecha(d.acceso.creado)],
            ["Último ingreso", d.acceso.ultimoIngreso ? `${fecha(d.acceso.ultimoIngreso)} · ${d.acceso.ultimoIngreso.slice(11, 16)}` : ""],
            ["Contraseña cambiada", fecha(d.acceso.claveCambiada)],
        ]));
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
        const tel = editable.razones[0]?.sucursales[0]?.telefono || d.empresa.telefono;
        if (!$("#rma-telefono").value && tel) $("#rma-telefono").value = tel;
    };

    /* Editor del perfil: trabaja sobre una copia (borrador) y la manda entera al guardar. */
    const editor = $(".perfil-editor");
    let borrador = null;
    let logoNuevo; // undefined = no lo tocó; null = lo quitó; "data:…" = uno nuevo
    const copia = (x) => JSON.parse(JSON.stringify(x));
    const sucursalVacia = () => ({ nombre: "", direccion: "", contacto: "", telefono: "" });
    const fijar = (ruta, valor) => {
        const partes = ruta.split(".");
        let o = borrador;
        for (const p of partes.slice(0, -1)) o = o[p];
        o[partes.at(-1)] = valor;
    };
    let idCampo = 0;
    const campoTexto = (ruta, etiqueta, valor, { area = false, tipo = "text", max = 160, auto = "off", ayuda = "", clase = "", lugar = "", modo } = {}) => {
        const id = `pf-c${++idCampo}`;
        const entrada = crear(area ? "textarea" : "input", {
            id, name: ruta, "data-campo": ruta, maxlength: max, autocomplete: auto, placeholder: lugar,
            ...(area ? { rows: 2 } : { type: tipo }), ...(modo ? { inputmode: modo } : {}),
        });
        entrada.value = valor || "";
        entrada.addEventListener("input", () => { fijar(ruta, entrada.value); entrada.removeAttribute("aria-invalid"); });
        return crear("div", { class: `campo ${clase}`.trim() }, [
            crear("label", { for: id, text: etiqueta }), entrada, ...(ayuda ? [crear("p", { class: "campo-ayuda", text: ayuda })] : []),
        ]);
    };
    const botonIcono = (icono, texto, accion, { deshabilitado = false, clase = "" } = {}) => {
        const b = crear("button", { type: "button", class: `boton-quitar ${clase}`.trim(), disabled: deshabilitado, "aria-label": texto, title: deshabilitado ? "Tiene que quedar al menos una" : texto }, [iconoFijo(icono)]);
        b.addEventListener("click", accion);
        return b;
    };
    const botonAgregar = (texto, accion) => {
        const b = crear("button", { type: "button", class: "boton-agregar" }, [iconoFijo("mas"), crear("span", { text: texto })]);
        b.addEventListener("click", accion);
        return b;
    };

    const pintarEditor = (enfocar) => {
        idCampo = 0;
        const logoActual = logoNuevo === undefined ? editable.logo : logoNuevo;
        const vistaLogo = logoActual ? crear("img", { src: logoActual, alt: "Logo de tu empresa" }) : crear("span", { class: "perfil-logo-vacio", text: iniciales(borrador.nombre || editable.nombre) });
        const entradaLogo = crear("input", { type: "file", id: "pf-logo", accept: "image/png,image/jpeg,image/webp", class: "solo-lectores", "data-campo": "logo" });
        entradaLogo.addEventListener("change", () => cargarLogo(entradaLogo));
        const quitarLogo = crear("button", { type: "button", class: "enlace-chico", text: "Quitar el logo", hidden: !logoActual });
        quitarLogo.addEventListener("click", () => { logoNuevo = null; pintarEditor(); $("#pf-logo-boton")?.focus(); });

        const razones = borrador.razones.map((r, i) => crear("fieldset", { class: "editor-razon" }, [
            crear("legend", { class: "editor-razon-titulo" }, [
                crear("span", { class: "editor-numero", text: String(i + 1) }),
                crear("span", { text: "Razón social" }),
            ]),
            botonIcono("quitar", `Quitar la razón social ${i + 1}`, () => { borrador.razones.splice(i, 1); pintarEditor(`razones.${Math.max(0, i - 1)}.razon`); },
                { deshabilitado: borrador.razones.length <= 1, clase: "editor-quitar-razon" }),
            crear("div", { class: "editor-rejilla" }, [
                campoTexto(`razones.${i}.razon`, "Razón social", r.razon, { max: 160, auto: "organization", lugar: "Como aparece en tu RIF" }),
                campoTexto(`razones.${i}.rif`, "RIF / RUC", r.rif, { max: 25, lugar: "J-12345678-9", clase: "campo-rif" }),
            ]),
            crear("div", { class: "editor-sucursales", "data-campo": `razones.${i}.sucursales` }, [
                crear("p", { class: "editor-sub", text: `Sucursales (${r.sucursales.length})` }),
                ...r.sucursales.map((s, j) => crear("div", { class: "editor-sucursal" }, [
                    crear("div", { class: "editor-sucursal-cabeza" }, [
                        crear("strong", { text: s.nombre || `Sucursal ${j + 1}` }),
                        botonIcono("quitar", `Quitar la sucursal ${j + 1} de esta razón social`, () => { r.sucursales.splice(j, 1); pintarEditor(`razones.${i}.sucursales.${Math.max(0, j - 1)}.nombre`); },
                            { deshabilitado: r.sucursales.length <= 1 }),
                    ]),
                    crear("div", { class: "editor-rejilla" }, [
                        campoTexto(`razones.${i}.sucursales.${j}.nombre`, "Nombre de la sucursal", s.nombre, { max: 80, lugar: "Principal, Centro, Almacén…" }),
                        campoTexto(`razones.${i}.sucursales.${j}.contacto`, "Nombre de contacto", s.contacto, { max: 80, auto: "name", lugar: "Quién recibe o atiende" }),
                        campoTexto(`razones.${i}.sucursales.${j}.telefono`, "Número de contacto", s.telefono, { tipo: "tel", max: 30, auto: "tel", modo: "tel", lugar: "0414-1234567" }),
                        campoTexto(`razones.${i}.sucursales.${j}.direccion`, "Dirección", s.direccion, { area: true, max: 300, auto: "street-address", lugar: "Calle, edificio o local, ciudad y estado", clase: "campo-ancho" }),
                    ]),
                ])),
                botonAgregar("Agregar sucursal", () => { r.sucursales.push(sucursalVacia()); pintarEditor(`razones.${i}.sucursales.${r.sucursales.length - 1}.nombre`); }),
            ]),
        ]));

        editor.replaceChildren(
            crear("section", { class: "editor-bloque" }, [
                crear("h2", { class: "editor-titulo", text: "Tu empresa" }),
                crear("div", { class: "editor-identidad" }, [
                    crear("div", { class: "editor-logo" }, [
                        crear("div", { class: "editor-logo-vista" }, [vistaLogo]),
                        crear("div", { class: "editor-logo-acciones" }, [
                            (() => {
                                const b = crear("button", { type: "button", class: "boton boton-claro", id: "pf-logo-boton" }, [iconoFijo("subir"), crear("span", { text: logoActual ? "Cambiar el logo" : "Subir el logo" })]);
                                b.addEventListener("click", () => entradaLogo.click());
                                return b;
                            })(),
                            entradaLogo,
                            quitarLogo,
                            crear("p", { class: "campo-ayuda", text: "PNG, JPG o WebP. Lo ajustamos a 512 px." }),
                        ]),
                    ]),
                    campoTexto("nombre", "Nombre del cliente", borrador.nombre, { max: 120, auto: "organization", lugar: "Como te conocen tus clientes", ayuda: "El nombre comercial de tu empresa. Las razones sociales van abajo.", clase: "campo-nombre" }),
                ]),
            ]),
            crear("section", { class: "editor-bloque" }, [
                crear("h2", { class: "editor-titulo", text: "Redes sociales" }),
                crear("p", { class: "tarjeta-nota", text: "Escribe tu usuario (@tuempresa) o pega el enlace de tu perfil. Las que no tengas, déjalas vacías." }),
                crear("div", { class: "editor-redes" }, REDES.map(([id, nombre, lugar]) => {
                    const c = campoTexto(`redes.${id}`, nombre, borrador.redes[id] || "", { max: 200, lugar, clase: "campo-red" });
                    $("label", c).prepend(iconoFijo(id));
                    return c;
                })),
            ]),
            crear("section", { class: "editor-bloque" }, [
                crear("h2", { class: "editor-titulo", text: "Razones sociales y sucursales" }),
                crear("p", { class: "tarjeta-nota", text: "Al menos una razón social con su RIF, y cada una con al menos una sucursal." }),
                crear("div", { class: "editor-razones", "data-campo": "razones" }, razones),
                borrador.razones.length < 10 ? botonAgregar("Agregar razón social", () => {
                    borrador.razones.push({ razon: "", rif: "", sucursales: [sucursalVacia()] });
                    pintarEditor(`razones.${borrador.razones.length - 1}.razon`);
                }) : crear("span"),
            ]),
            crear("div", { class: "editor-pie" }, [
                crear("p", { class: "cuenta-fallo", role: "alert", hidden: true }),
                crear("div", { class: "editor-pie-botones" }, [
                    (() => { const b = crear("button", { type: "button", class: "boton boton-claro", text: "Cancelar" }); b.addEventListener("click", () => cerrarEditor(true)); return b; })(),
                    crear("button", { type: "submit", class: "boton boton-tinta cuenta-boton" }, [crear("span", { class: "cuenta-boton-texto", text: "Guardar perfil" }), crear("span", { class: "cuenta-girando", "aria-hidden": "true" })]),
                ]),
            ]),
        );
        if (enfocar) $(`[data-campo="${enfocar}"]`, editor)?.focus();
    };

    // El logo se achica en el navegador (máximo 512 px, WebP o PNG) antes de mandarlo: llega liviano y limpio.
    const cargarLogo = async (entrada) => {
        const archivo = entrada.files[0];
        entrada.value = "";
        if (!archivo) return;
        if (!/^image\/(png|jpeg|webp)$/.test(archivo.type)) { fallo(editor, "El logo tiene que ser una imagen PNG, JPG o WebP."); return; }
        try {
            const url = URL.createObjectURL(archivo);
            const img = await new Promise((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = mal; i.src = url; });
            URL.revokeObjectURL(url);
            let lado = 512;
            let dato = "";
            for (let intento = 0; intento < 4; intento++) {
                const escala = Math.min(1, lado / Math.max(img.naturalWidth, img.naturalHeight));
                const lienzo = document.createElement("canvas");
                lienzo.width = Math.max(1, Math.round(img.naturalWidth * escala));
                lienzo.height = Math.max(1, Math.round(img.naturalHeight * escala));
                lienzo.getContext("2d").drawImage(img, 0, 0, lienzo.width, lienzo.height);
                dato = lienzo.toDataURL("image/webp", 0.9);
                if (!dato.startsWith("data:image/webp")) dato = lienzo.toDataURL("image/png");
                if (dato.length * 0.75 <= 380 * 1024) break;
                lado = Math.round(lado * 0.75);
            }
            if (dato.length * 0.75 > 380 * 1024) { fallo(editor, "No pudimos achicar el logo lo suficiente. Prueba con otra imagen."); return; }
            logoNuevo = dato;
            fallo(editor, "");
            pintarEditor();
            $("#pf-logo-boton")?.focus();
        } catch (e) {
            fallo(editor, "No pudimos leer esa imagen. Prueba con otra.");
        }
    };

    function abrirEditor() {
        if (!editable) return;
        borrador = copia({ nombre: editable.nombre, razones: editable.razones, redes: editable.redes });
        if (!borrador.razones.length) borrador.razones.push({ razon: "", rif: "", sucursales: [sucursalVacia()] });
        for (const r of borrador.razones) if (!r.sucursales.length) r.sucursales.push(sucursalVacia());
        logoNuevo = undefined;
        pintarEditor();
        editor.hidden = false;
        for (const el of [".perfil-hero", ".perfil-razones-caja", ".perfil-editar"]) $(el).hidden = true;
        $("#vista-perfil").scrollIntoView({ behavior: P.QUIETO ? "auto" : "smooth", block: "start" });
        $('[data-campo="nombre"]', editor)?.focus({ preventScroll: true });
    }
    function cerrarEditor(volverFoco) {
        if (editor.hidden) return;
        editor.hidden = true;
        editor.replaceChildren();
        for (const el of [".perfil-hero", ".perfil-razones-caja", ".perfil-editar"]) $(el).hidden = false;
        if (volverFoco) $(".perfil-editar").focus();
    }
    $(".perfil-editar").addEventListener("click", abrirEditor);
    editor.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        fallo(editor, "");
        for (const x of $$("[aria-invalid]", editor)) x.removeAttribute("aria-invalid");
        // Lo mínimo se revisa aquí; el servidor revisa todo y dice qué campo falta.
        if (!borrador.razones.length) { fallo(editor, "Agrega al menos una razón social."); return; }
        const cuerpo = { version: editable.version, nombre: borrador.nombre, razones: borrador.razones, redes: borrador.redes };
        if (logoNuevo !== undefined) cuerpo.logo = logoNuevo;
        ocupado(editor, true, "Guardando…");
        const r = await llamar("perfil", { metodo: "POST", cuerpo });
        ocupado(editor, false, "Guardar perfil");
        if (!r.ok) {
            if (r.status === 401) return;
            fallo(editor, r.datos.error || "No pudimos guardar tu perfil.");
            const campo = r.datos.campo && $(`[data-campo="${CSS.escape(r.datos.campo)}"]`, editor);
            if (campo) {
                if (/^(INPUT|TEXTAREA)$/.test(campo.tagName)) campo.setAttribute("aria-invalid", "true");
                campo.scrollIntoView({ behavior: P.QUIETO ? "auto" : "smooth", block: "center" });
                (campo.matches("input, textarea") ? campo : $("input, textarea, button", campo))?.focus({ preventScroll: true });
            }
            return;
        }
        editable = r.datos.editable;
        cerrarEditor(false);
        pintarHero();
        pintarRazones();
        pintarAvatar(editable.logo, editable.nombre);
        $(".panel-empresa").textContent = editable.nombre;
        avisar("");
        $(".perfil-hero").scrollIntoView({ behavior: P.QUIETO ? "auto" : "smooth", block: "start" });
        $(".perfil-editar").focus({ preventScroll: true });
    });
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
