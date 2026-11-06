/* SUPRICOM: comportamiento de la página de inicio. Sin dependencias. */
(() => {
    "use strict";

    /* ---------------------------------------------------------------- Sede */
    // Cada sede tiene sus productos, categorías, marcas y contacto. Se elige, en este orden: por el enlace
    // (?sede=caracas), por el dominio de la sede, por la que el visitante eligió antes y, si no hay nada,
    // por la zona horaria (Panamá o Venezuela); en ese último caso se le ofrece usar su ubicación.
    const TODO = window.SUPRICOM;
    const IDS_SEDE = Object.keys(TODO.sedes);
    const CLAVE_SEDE = "supricom-sede";
    const sedeGuardada = () => { try { return localStorage.getItem(CLAVE_SEDE); } catch (e) { return null; } };
    const guardarSede = (s) => { try { localStorage.setItem(CLAVE_SEDE, s); } catch (e) { /* sin almacenamiento: dura hasta recargar */ } };
    const elegirSede = () => {
        const enlace = new URLSearchParams(location.search).get("sede");
        if (TODO.sedes[enlace]) return { id: enlace, origen: "enlace" };
        const host = location.hostname.replace(/^www\./, "");
        const porDominio = IDS_SEDE.find((s) => TODO.sedes[s].dominio === host);
        if (porDominio) return { id: porDominio, origen: "dominio" };
        const antes = sedeGuardada();
        if (TODO.sedes[antes]) return { id: antes, origen: "guardada" };
        let zona = "";
        try { zona = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) { /* sin zona horaria */ }
        return { id: zona === "America/Panama" ? "panama" : "valencia", origen: "supuesta" };
    };
    const SEDE = elegirSede();
    const S = TODO.sedes[SEDE.id];
    // Lo de la sede con la forma que usa el resto de la página.
    const destacadoEn = (lista, cat) => lista.find((p) => p.cat === cat && p.destacado) || lista.find((p) => p.cat === cat);
    const D = {
        odoo: S.tienda,
        productos: S.productos,
        categorias: TODO.categorias
            .filter((c) => S.productos.some((p) => p.cat === c.id))
            .map((c) => ({ ...c, foto: destacadoEn(S.productos, c.id).id })),
        banners: S.banners.map((k) => TODO.banners[k]),
        marcas: S.logos.map((n) => ({ nombre: n, ...TODO.logos[n] })),
    };
    document.documentElement.dataset.sede = SEDE.id;

    const QUIETO = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mqEscritorio = window.matchMedia("(min-width: 961px)");
    const escritorio = () => mqEscritorio.matches;
    const $ = (s, el = document) => el.querySelector(s);
    const $$ = (s, el = document) => [...el.querySelectorAll(s)];
    const foto = (id, tam = 512) => `${D.odoo}/web/image/product.template/${id}/image_${tam}`;
    const ficha = (id) => `${D.odoo}/shop/p-${id}`;
    const buscar = (q) => `${D.odoo}/shop${q ? `?search=${encodeURIComponent(q)}` : ""}`;
    const miles = (n) => n.toLocaleString("es-VE");
    const crear = (tag, props = {}, hijos = []) => {
        const el = document.createElement(tag);
        for (const [k, v] of Object.entries(props)) {
            if (k === "class") el.className = v;
            else if (k === "text") el.textContent = v;
            else if (k.startsWith("data-") || k.startsWith("aria-") || k === "role") el.setAttribute(k, v);
            else el[k] = v;
        }
        for (const h of hijos) el.append(h);
        return el;
    };
    const destacadoDe = (cat) => destacadoEn(D.productos, cat);
    // Íconos dibujados (trazo redondeado), en vez de glifos de texto.
    const ICONOS = {
        ir: "M5 12h14M13 6l6 6-6 6", mas: "M12 5v14M5 12h14", menos: "M5 12h14", listo: "m5 12.5 4.5 4.5L19 7.5",
        revisar: "M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.7M12 17h.01",
    };
    const icono = (nombre, clase = "icono-ico") => {
        const e = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        e.setAttribute("viewBox", "0 0 24 24");
        e.setAttribute("aria-hidden", "true");
        e.setAttribute("class", clase);
        e.innerHTML = `<path d="${ICONOS[nombre]}"/>`;
        return e;
    };
    // Una foto que no carga deja un fondo neutro en vez del ícono roto del navegador.
    document.addEventListener("error", (ev) => {
        const i = ev.target;
        if (i.tagName !== "IMG" || i.dataset.sinFoto) return;
        i.dataset.sinFoto = "1";
        i.removeAttribute("src");
        i.classList.add("sin-foto");
    }, true);
    // Odoo tiene una sola tienda, con la existencia de Valencia: en las sedes sin tienda propia una ficha
    // diría «Agotado» aunque la sede lo tenga. Ahí los productos van a la lista de cotización y las
    // categorías, marcas y banners se buscan entre los productos de la sede (los arma la sección de la lista).
    const FICHAS = Boolean(S.tiendaPropia);
    // Lo arma la sección de la cotización; lo usan el anillo, las categorías, las marcas y el selector de sede.
    const enLaSede = { agregar: () => {}, buscar: () => {}, lista: () => null, usada: () => false, marcar: () => {} };
    // Enlace a una búsqueda: en la tienda si la sede tiene la suya; si no, en el buscador de la lista.
    const enlazarBusqueda = (a, q) => {
        if (FICHAS) { a.href = buscar(q); return; }
        a.href = "#carrito";
        a.addEventListener("click", (ev) => { ev.preventDefault(); enLaSede.buscar(q); });
    };

    // Enlaces a la tienda real de Odoo.
    for (const a of $$("[data-odoo]")) a.href = D.odoo + a.dataset.odoo;
    // Cotizar: por WhatsApp si la sede tiene número; si no, por correo a su buzón de la tienda web.
    const POR_WHATSAPP = Boolean(S.whatsapp);
    const cotizar = (texto) => (POR_WHATSAPP
        ? `https://wa.me/${S.whatsapp}?text=${encodeURIComponent(texto)}`
        : `mailto:${S.correo}?subject=${encodeURIComponent(`Solicitud de cotización · ${S.nombre}`)}&body=${encodeURIComponent(texto)}`);
    const MEDIO = POR_WHATSAPP ? "WhatsApp" : "correo";

    // Textos de la página que dependen de la sede.
    for (const el of $$("[data-sede]")) {
        const v = { documento: S.documento, medio: MEDIO }[el.dataset.sede];
        if (v !== undefined) el.textContent = v;
    }
    for (const el of $$("[data-solo-whatsapp]")) el.hidden = !POR_WHATSAPP;
    for (const el of $$("[data-solo-correo]")) el.hidden = POR_WHATSAPP;

    const nombreCategoria = Object.fromEntries(D.categorias.map((c) => [c.id, c.nombre]));

    /* ---------------------------------------------------------------- Modo claro / oscuro */
    const raiz = document.documentElement;
    const botonTema = $(".tema");
    const sistemaOscuro = window.matchMedia("(prefers-color-scheme: dark)");
    const guardado = () => { try { return localStorage.getItem("supricom-tema"); } catch (e) { return null; } };
    const ponerTema = (t, guardar) => {
        raiz.setAttribute("data-tema", t);
        const oscuro = t === "oscuro";
        botonTema.setAttribute("aria-pressed", String(oscuro));
        botonTema.setAttribute("aria-label", oscuro ? "Activar modo claro" : "Activar modo oscuro");
        const temaMenu = $(".menu-tema");
        if (temaMenu) temaMenu.textContent = oscuro ? "Cambiar a modo claro" : "Cambiar a modo oscuro";
        if (guardar) { try { localStorage.setItem("supricom-tema", t); } catch (e) { /* sin almacenamiento: dura hasta recargar */ } }
    };
    ponerTema(raiz.getAttribute("data-tema") === "oscuro" ? "oscuro" : "claro", false);
    botonTema.addEventListener("click", () => ponerTema(raiz.getAttribute("data-tema") === "oscuro" ? "claro" : "oscuro", true));
    const temaDelEnlace = ["claro", "oscuro"].includes(new URLSearchParams(location.search).get("tema"));
    sistemaOscuro.addEventListener("change", (e) => { if (!guardado() && !temaDelEnlace) ponerTema(e.matches ? "oscuro" : "claro", false); });

    /* ---------------------------------------------------------------- Selector de sede y ubicación */
    const selectorSede = $("#sede");
    const botonUbicar = $(".sede-ubicar");
    const avisoSede = $(".sede-aviso");
    const textoAvisoSede = $(".sede-aviso-texto");
    const botonCambiarAviso = $(".sede-aviso-cambiar");
    const CLAVE_LISTA = "supricom-cotizacion-viaja";
    for (const id of IDS_SEDE) selectorSede.append(crear("option", { value: id, text: TODO.sedes[id].nombre }));
    selectorSede.value = SEDE.id;
    // Un enlace con ?sede= cuenta como elección si el visitante todavía no tenía una.
    if (SEDE.origen === "enlace" && !TODO.sedes[sedeGuardada()]) guardarSede(SEDE.id);
    // Cambiar de sede recarga la página con ?sede= (enlace que se puede compartir) y la recuerda.
    // La lista de códigos que ya escribió viaja con él.
    const irASede = (id) => {
        guardarSede(id);
        if (id === SEDE.id) return;
        const lista = enLaSede.lista();
        try { if (lista) sessionStorage.setItem(CLAVE_LISTA, lista); } catch (e) { /* sin almacenamiento: la cotización no viaja */ }
        const url = new URL(location.href);
        url.searchParams.set("sede", id);
        url.hash = "";
        location.assign(url.href);
    };
    selectorSede.addEventListener("change", () => irASede(selectorSede.value));

    // La sede más cercana al visitante, en línea recta.
    const distanciaKm = ([a, b], [c, d]) => {
        const r = Math.PI / 180;
        const h = Math.sin(((c - a) * r) / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(((d - b) * r) / 2) ** 2;
        return 12742 * Math.asin(Math.sqrt(h));
    };
    const masCercana = (punto) => IDS_SEDE.reduce((mejor, id) =>
        (distanciaKm(punto, TODO.sedes[id].coords) < distanciaKm(punto, TODO.sedes[mejor].coords) ? id : mejor), IDS_SEDE[0]);

    // El aviso se muestra antes de escribir el texto, para que el lector de pantalla lo anuncie.
    const mostrarAviso = (texto, { enfocar = false, cambiarA = null } = {}) => {
        avisoSede.hidden = false;
        botonCambiarAviso.hidden = !cambiarA;
        if (cambiarA) {
            botonCambiarAviso.textContent = `Cambiar a ${TODO.sedes[cambiarA].nombre}`;
            botonCambiarAviso.dataset.destino = cambiarA;
        }
        textoAvisoSede.textContent = "";
        requestAnimationFrame(() => {
            textoAvisoSede.textContent = texto;
            if (enfocar) (cambiarA ? botonCambiarAviso : $(".sede-aviso-listo")).focus();
        });
    };
    const cerrarAviso = () => { avisoSede.hidden = true; };
    // Cerrarlo de cualquier forma cuenta como aceptar la sede que se está viendo.
    const aceptarSede = (devolverFoco) => {
        guardarSede(SEDE.id);
        const estabaDentro = avisoSede.contains(document.activeElement);
        cerrarAviso();
        if (devolverFoco || estabaDentro) selectorSede.focus();
    };
    const avisoSupuesta = `Te mostramos los productos de ${S.nombre}. ¿Compras en otra sede? Usa tu ubicación o elígela en la lista.`;
    // Si ya empezó a usar la página, no se la recarga sin preguntar.
    const yaUsoLaPagina = () => window.scrollY > 120
        || enLaSede.usada()
        || (document.activeElement && document.activeElement !== document.body);
    let buscandoUbicacion = false;
    const ubicar = (pedidoPorLaPersona) => {
        if (buscandoUbicacion) return;
        const fallo = (texto) => mostrarAviso(pedidoPorLaPersona ? texto : avisoSupuesta, { enfocar: pedidoPorLaPersona });
        if (!("geolocation" in navigator)) { fallo("Este navegador no comparte la ubicación. Elige tu sede en la lista."); return; }
        buscandoUbicacion = true;
        botonUbicar.setAttribute("aria-busy", "true");
        botonUbicar.classList.add("buscando");
        // Hay navegadores que no responden nunca si se cierra la pregunta del permiso: se corta a los 12 s.
        let reloj = 0;
        const terminar = () => {
            if (!buscandoUbicacion) return false;
            buscandoUbicacion = false;
            clearTimeout(reloj);
            botonUbicar.removeAttribute("aria-busy");
            botonUbicar.classList.remove("buscando");
            return true;
        };
        reloj = setTimeout(() => { if (terminar()) fallo("No pudimos saber dónde estás. Elige tu sede en la lista."); }, 12000);
        navigator.geolocation.getCurrentPosition((pos) => {
            if (!terminar()) return;
            const id = masCercana([pos.coords.latitude, pos.coords.longitude]);
            if (id === SEDE.id) {
                guardarSede(id);
                if (pedidoPorLaPersona) mostrarAviso(`Tu sede más cercana es ${S.nombre}: ya estás viendo sus productos.`, { enfocar: true });
                else cerrarAviso();
                return;
            }
            if (pedidoPorLaPersona || !yaUsoLaPagina()) { irASede(id); return; }
            mostrarAviso(`Tu sede más cercana es ${TODO.sedes[id].nombre}. ¿Quieres ver sus productos?`, { cambiarA: id });
        }, (err) => {
            if (terminar()) fallo(err.code === 1
                ? "No diste permiso para usar tu ubicación. Elige tu sede en la lista."
                : "No pudimos saber dónde estás. Elige tu sede en la lista.");
        }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60 * 60 * 1000 });
    };
    botonUbicar.addEventListener("click", () => ubicar(true));
    $(".sede-aviso-ubicar").addEventListener("click", () => ubicar(true));
    $(".sede-aviso-listo").addEventListener("click", () => aceptarSede(true));
    botonCambiarAviso.addEventListener("click", () => irASede(botonCambiarAviso.dataset.destino));
    // El Escape o el clic que usa el carrito (o que ocurre dentro de él) no cuenta como respuesta al aviso de sede.
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !e.defaultPrevented && !avisoSede.hidden) aceptarSede(false); });
    document.addEventListener("click", (e) => { if (!avisoSede.hidden && !e.target.closest(".sede-selector, #carrito")) aceptarSede(false); });
    // Primera visita sin sede conocida: si ya dio permiso de ubicación se usa sin preguntar; si no, se le ofrece.
    if (SEDE.origen === "supuesta") {
        const ofrecer = () => mostrarAviso(avisoSupuesta);
        if (navigator.permissions && navigator.permissions.query) {
            navigator.permissions.query({ name: "geolocation" })
                .then((p) => { if (p.state === "granted") ubicar(false); else ofrecer(); })
                .catch(ofrecer);
        } else ofrecer();
    }

    /* ---------------------------------------------------------------- Encabezado y menú */
    const cabecera = $(".cabecera");
    const menu = $("#menu");
    const menuBoton = $(".menu-boton");
    const cerrarMenu = (devolverFoco) => {
        menu.classList.remove("abierto");
        menuBoton.setAttribute("aria-expanded", "false");
        menuBoton.setAttribute("aria-label", "Abrir menú");
        if (devolverFoco) menuBoton.focus();
    };
    menuBoton.addEventListener("click", () => {
        const abierto = menu.classList.toggle("abierto");
        if (abierto) { cerrarAviso(); cerrarAvisoCarrito(); } // los avisos taparían los primeros enlaces
        menuBoton.setAttribute("aria-expanded", String(abierto));
        menuBoton.setAttribute("aria-label", abierto ? "Cerrar menú" : "Abrir menú");
    });
    for (const a of $$("a", menu)) a.addEventListener("click", () => cerrarMenu(false));
    $(".menu-ubicar").addEventListener("click", (ev) => { ev.stopPropagation(); cerrarMenu(false); ubicar(true); });
    $(".menu-tema").addEventListener("click", () => botonTema.click());
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && menu.classList.contains("abierto")) cerrarMenu(true); });
    document.addEventListener("click", (e) => { if (menu.classList.contains("abierto") && !cabecera.contains(e.target)) cerrarMenu(false); });

    /* ---------------------------------------------------------------- Aparecer y sección activa */
    const aparecer = new IntersectionObserver((entradas) => {
        for (const e of entradas) {
            if (e.isIntersecting) {
                e.target.classList.add("visible");
                aparecer.unobserve(e.target);
            }
        }
    }, { threshold: 0.15 });
    for (const el of $$(".aparece")) aparecer.observe(el);
    setTimeout(() => { for (const el of $$(".aparece")) el.classList.add("visible"); }, 2500);

    const activa = new IntersectionObserver((entradas) => {
        for (const e of entradas) {
            if (!e.isIntersecting || !e.target.id) continue;
            for (const a of $$("a[href^='#']", menu)) {
                const es = a.getAttribute("href") === `#${e.target.id}`;
                a.classList.toggle("activo", es);
                a.toggleAttribute("aria-current", es);
            }
        }
    }, { rootMargin: "-45% 0px -50% 0px" });
    for (const s of $$("[data-seccion]")) activa.observe(s);

    /* ---------------------------------------------------------------- Portada: anillo 3D */
    const orbita = $(".orbita");
    const escena = $(".orbita-escena");
    const anillo = $(".anillo");
    const enAnillo = D.categorias.map((c) => destacadoDe(c.id)).filter(Boolean);
    // Ficha del producto que está al frente, con miniaturas para elegir otro.
    const ficha_ = {
        cat: $(".ficha-cat"), nombre: $(".ficha-nombre"), marca: $(".ficha-marca"), codigo: $(".ficha-codigo"),
        ver: $(".ficha-ver"), cotizar: $(".ficha-cotizar"), mini: $(".ficha-mini"),
    };
    const minis = enAnillo.map((p, i) => {
        const b = crear("button", { type: "button", "aria-label": `Ver ${p.marca} ${p.nombre}` }, [crear("img", { src: foto(p.id), alt: "" })]);
        b.addEventListener("click", () => { destino = anguloMasCercano(i); if (QUIETO) { angulo = destino; destino = null; pintarAnillo(); } arrancar(); });
        ficha_.mini.append(b);
        return b;
    });
    const pintarFicha = (i) => {
        const p = enAnillo[i];
        ficha_.cat.textContent = nombreCategoria[p.cat] || "";
        ficha_.nombre.textContent = p.nombre;
        ficha_.marca.textContent = p.marca;
        ficha_.codigo.textContent = p.codigo;
        ficha_.ver.href = FICHAS ? ficha(p.id) : "#carrito";
        ficha_.cotizar.dataset.agregar = p.codigo.toUpperCase();
        enLaSede.marcar();
        minis.forEach((b, k) => b.setAttribute("aria-current", String(k === i)));
    };
    const paso = 360 / enAnillo.length;
    const items = enAnillo.map((p, i) => {
        const a = crear("a", { class: "orbita-item", href: FICHAS ? ficha(p.id) : "#carrito", draggable: false, "aria-label": FICHAS ? `${p.marca} ${p.nombre}` : `Agregar ${p.marca} ${p.nombre} al carrito` }, [
            crear("img", { src: foto(p.id), alt: "", draggable: false }),
            crear("span", { text: p.marca }),
        ]);
        a.dataset.i = i;
        anillo.append(a);
        return a;
    });
    // Radio mínimo para que las tarjetas vecinas no se crucen: (ancho/2) / tan(paso/2) + margen.
    const radio = () => {
        const ancho = escritorio() ? 210 : 150;
        return Math.ceil(ancho / 2 / Math.tan(Math.PI / enAnillo.length)) + (escritorio() ? 75 : 20);
    };
    let elegido = false; // pausado con el botón: no gira solo ni con el scroll hasta que se reanude
    // El scroll también hace girar el anillo. Mientras está detenido, esa parte queda congelada (así no salta
    // ni cambia de producto); al seguir, se compensa en el ángulo para que no dé un brinco.
    let giroCongelado = null;
    const giroScroll = () => {
        if (!escritorio() || QUIETO) return 0;
        if (pausaAnillo) {
            if (giroCongelado === null) giroCongelado = window.scrollY * 0.08;
            return giroCongelado;
        }
        return window.scrollY * 0.08;
    };
    const soltarGiroCongelado = () => {
        if (giroCongelado === null) return;
        if (escritorio() && !QUIETO) angulo += giroCongelado - window.scrollY * 0.08;
        giroCongelado = null;
    };
    let angulo = 0;
    let velocidad = 0;
    let arrastre = null;
    let movido = false;
    let destino = null;
    let frenteActual = -1;
    let radioPintado = -1;
    let pausaAnillo = false;
    let enPantalla = true;
    let corriendo = false;
    let tPrevio = 0;

    const pintarAnillo = () => {
        const r = radio();
        if (r !== radioPintado) {
            radioPintado = r;
            items.forEach((el, i) => { el.style.transform = `rotateY(${i * paso}deg) translateZ(${r}px)`; });
        }
        const giro = angulo + giroScroll();
        anillo.style.transform = `translateZ(${-r}px) rotateX(-8deg) rotateY(${-giro}deg)`;
        let mejor = 0;
        let mejorCos = -2;
        items.forEach((el, i) => {
            const cos = Math.cos(((i * paso - giro) * Math.PI) / 180);
            el.style.opacity = String(0.2 + 0.8 * Math.max(0, cos));
            if (cos > mejorCos) { mejorCos = cos; mejor = i; }
        });
        if (mejor !== frenteActual) {
            frenteActual = mejor;
            items.forEach((el, i) => { el.tabIndex = i === mejor ? 0 : -1; });
            pintarFicha(mejor);
        }
    };
    const anguloMasCercano = (i) => {
        const objetivo = i * paso - giroScroll();
        return objetivo + Math.round((angulo - objetivo) / 360) * 360;
    };
    const cuadro = (t) => {
        const f = Math.min(3, (t - tPrevio) / 16.67); // 1 a 60 fps: la velocidad no depende de la pantalla
        tPrevio = t;
        if (!arrastre) {
            if (destino !== null) {
                angulo += (destino - angulo) * (1 - Math.pow(0.88, f));
                if (Math.abs(destino - angulo) < 0.05) { angulo = destino; destino = null; }
            } else {
                angulo += velocidad * f;
                velocidad *= Math.pow(0.94, f);
                if (!QUIETO && !pausaAnillo && Math.abs(velocidad) < 0.12) angulo += 0.12 * f;
            }
        }
        pintarAnillo();
        const quieto = (QUIETO || pausaAnillo) && !arrastre && destino === null && Math.abs(velocidad) < 0.01;
        if (!enPantalla || quieto) { corriendo = false; return; }
        requestAnimationFrame(cuadro);
    };
    const arrancar = () => {
        if (corriendo || !enPantalla) return;
        corriendo = true;
        tPrevio = performance.now();
        requestAnimationFrame(cuadro);
    };
    new IntersectionObserver(([e]) => { enPantalla = e.isIntersecting; arrancar(); }).observe(orbita);

    escena.addEventListener("dragstart", (ev) => ev.preventDefault());
    escena.addEventListener("pointerdown", (ev) => {
        if (ev.button !== 0) return;
        arrastre = { x: ev.clientX, a: angulo, id: ev.pointerId };
        movido = false;
        destino = null;
        arrancar();
    });
    escena.addEventListener("pointermove", (ev) => {
        if (!arrastre) return;
        const dx = ev.clientX - arrastre.x;
        if (!movido) {
            if (Math.abs(dx) <= 5) return;
            movido = true;
            orbita.classList.add("arrastrando");
            escena.setPointerCapture(arrastre.id); // solo al arrastrar: un clic normal llega al enlace
        }
        const nuevo = arrastre.a - dx * 0.35;
        velocidad = QUIETO ? 0 : nuevo - angulo;
        angulo = nuevo;
    });
    const soltar = () => {
        arrastre = null;
        orbita.classList.remove("arrastrando");
        if (QUIETO) velocidad = 0;
    };
    escena.addEventListener("pointerup", soltar);
    escena.addEventListener("pointercancel", soltar);
    // Un arrastre no abre la ficha; un clic en una tarjeta de lado la trae al frente.
    escena.addEventListener("click", (ev) => {
        const fueArrastre = movido;
        movido = false;
        if (fueArrastre) { ev.preventDefault(); ev.stopPropagation(); return; }
        const item = ev.target.closest(".orbita-item");
        if (!item) return;
        const i = Number(item.dataset.i);
        if (i !== frenteActual) { ev.preventDefault(); destino = anguloMasCercano(i); arrancar(); }
        else if (!FICHAS) { ev.preventDefault(); enLaSede.agregar(enAnillo[i], item.querySelector("img")); }
    }, true);
    // Sin tienda propia no hay ficha que ver: queda solo «Cotizar».
    if (!FICHAS) ficha_.ver.hidden = true;
    // El anillo gira siempre y solo se detiene mientras el mouse está sobre una tarjeta (las del anillo o la
    // ficha), mientras se recorre con el teclado o si se pausó con el botón. Al salir, sigue girando.
    const filaVitrina = $(".vitrina-fila");
    const botonPausaAnillo = $(".orbita-pausa");
    let sobreTarjeta = false;
    let conTeclado = false;
    const pintarPausa = () => {
        const antes = pausaAnillo;
        pausaAnillo = sobreTarjeta || conTeclado || elegido;
        botonPausaAnillo.setAttribute("aria-pressed", String(elegido));
        botonPausaAnillo.setAttribute("aria-label", elegido ? "Seguir girando" : "Pausar el giro");
        if (!antes && pausaAnillo) giroScroll(); // congela la parte del scroll en el punto donde se detuvo
        if (antes && !pausaAnillo) { soltarGiroCongelado(); arrancar(); }
    };
    filaVitrina.addEventListener("pointerover", (ev) => {
        const sobre = Boolean(ev.target.closest(".orbita-item, .ficha"));
        if (sobre !== sobreTarjeta) { sobreTarjeta = sobre; pintarPausa(); }
    });
    filaVitrina.addEventListener("pointerleave", () => { sobreTarjeta = false; pintarPausa(); });
    // Con el teclado (foco visible) se detiene para poder leer; un clic con el mouse no lo deja detenido.
    filaVitrina.addEventListener("focusin", (ev) => { conTeclado = ev.target.matches(":focus-visible"); pintarPausa(); });
    filaVitrina.addEventListener("focusout", (ev) => { if (!filaVitrina.contains(ev.relatedTarget)) { conTeclado = false; pintarPausa(); } });
    botonPausaAnillo.addEventListener("click", () => { elegido = !elegido; pintarPausa(); });
    if (QUIETO) botonPausaAnillo.hidden = true;
    orbita.addEventListener("keydown", (e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        const i = (frenteActual + (e.key === "ArrowRight" ? 1 : -1) + items.length) % items.length;
        destino = anguloMasCercano(i);
        if (QUIETO) { angulo = destino; destino = null; }
        arrancar();
        pintarAnillo();
        items[i].focus({ preventScroll: true });
    });
    pintarAnillo();
    arrancar();

    /* ---------------------------------------------------------------- Portada: banners en abanico */
    const promos = $(".portada");
    const zonaBanners = $(".banners");
    const pistaBanners = $(".banners-pista");
    const pestanas = $(".banners-pestanas");
    const botonPausa = $("[data-pausa]", promos);
    const INTERVALO = 6000;
    promos.style.setProperty("--intervalo", `${INTERVALO / 1000}s`);
    const nB = D.banners.length;
    // Con un solo banner no hay nada que pasar: sin flechas, pestañas ni avance.
    $(".banners-controles").hidden = nB < 2;
    for (const f of $$(".flecha-lado", promos)) f.hidden = nB < 2;
    const banners = D.banners.map((b, i) => {
        const a = crear("a", { class: "banner", "aria-roledescription": "diapositiva", "aria-label": `${i + 1} de ${nB}: ${b.alt}` },
            [crear("img", { src: b.img, alt: "", draggable: false, decoding: "async", loading: i === 0 ? "eager" : "lazy", fetchPriority: i === 0 ? "high" : "low" })]);
        enlazarBusqueda(a, b.buscar);
        a.dataset.i = i;
        pistaBanners.append(a);
        return a;
    });
    let pasoBanner = 0;
    let pausaHover = false;
    let pausaFoco = false;
    let pausaBoton = QUIETO;
    let reloj = null;
    const frenteBanner = () => ((pasoBanner % nB) + nB) % nB;
    const desfase = (i) => {
        let o = (((i - frenteBanner()) % nB) + nB) % nB;
        if (o > nB / 2) o -= nB;
        return o;
    };
    const enPausa = () => pausaHover || pausaFoco || pausaBoton || document.hidden;
    const programar = () => {
        clearTimeout(reloj);
        promos.classList.toggle("pausado", enPausa());
        if (enPausa() || nB < 2) return;
        reloj = setTimeout(() => irBanner(pasoBanner + 1), INTERVALO);
    };
    const botonesBanner = D.banners.map((b, i) => {
        const btn = crear("button", { type: "button", "aria-label": b.nombre, title: b.nombre });
        btn.addEventListener("click", () => irBanner(pasoBanner + desfase(i)));
        pestanas.append(btn);
        return btn;
    });
    const pintarBanners = () => {
        const f = frenteBanner();
        banners.forEach((b, i) => {
            const o = desfase(i);
            const a = Math.abs(o);
            b.style.transform = `translateX(-50%) translateX(${o * 60}%) translateZ(${-a * 300}px) rotateY(${-o * 32}deg)`;
            b.style.opacity = a === 0 ? "1" : a === 1 ? "0.6" : "0";
            b.style.zIndex = String(10 - a);
            b.classList.toggle("frente", a === 0);
            b.tabIndex = a === 0 ? 0 : -1;
            b.setAttribute("aria-hidden", a === 0 ? "false" : "true");
        });
        // Si el foco quedó en un banner que se fue al fondo, pasa al del frente.
        if (banners.some((b) => b !== banners[f] && b.contains(document.activeElement))) banners[f].focus({ preventScroll: true });
        botonesBanner.forEach((btn, i) => {
            btn.setAttribute("aria-current", String(i === f));
            btn.querySelector(".avance")?.remove();
            if (i === f && !QUIETO) btn.append(crear("span", { class: "avance", "aria-hidden": "true" }));
        });
    };
    const irBanner = (p) => { pasoBanner = p; pintarBanners(); programar(); };
    pistaBanners.addEventListener("click", (ev) => {
        const b = ev.target.closest(".banner");
        if (!b) return;
        const o = desfase(Number(b.dataset.i));
        if (o !== 0) { ev.preventDefault(); irBanner(pasoBanner + o); }
    });
    for (const f of $$("[data-dir]", promos)) f.addEventListener("click", () => irBanner(pasoBanner + Number(f.dataset.dir)));
    const pintarBotonPausa = () => {
        botonPausa.setAttribute("aria-pressed", String(pausaBoton));
        botonPausa.setAttribute("aria-label", pausaBoton ? "Seguir pasando los banners" : "Pausar banners");
    };
    botonPausa.addEventListener("click", () => { pausaBoton = !pausaBoton; pintarBotonPausa(); pintarBanners(); programar(); });
    zonaBanners.addEventListener("mouseenter", () => { pausaHover = true; programar(); });
    zonaBanners.addEventListener("mouseleave", () => { pausaHover = false; pistaBanners.style.transform = ""; pintarBanners(); programar(); });
    promos.addEventListener("focusin", () => { pausaFoco = true; programar(); });
    promos.addEventListener("focusout", (e) => { if (!promos.contains(e.relatedTarget)) { pausaFoco = false; pintarBanners(); programar(); } });
    document.addEventListener("visibilitychange", () => { if (!document.hidden) pintarBanners(); programar(); });
    zonaBanners.addEventListener("mousemove", (ev) => {
        if (QUIETO) return;
        const r = zonaBanners.getBoundingClientRect();
        const x = (ev.clientX - r.left) / r.width - 0.5;
        const y = (ev.clientY - r.top) / r.height - 0.5;
        pistaBanners.style.transform = `rotateX(${-y * 6}deg) rotateY(${x * 8}deg)`;
    });
    // Deslizar con el dedo, solo si el gesto es más horizontal que vertical.
    let toque = null;
    zonaBanners.addEventListener("touchstart", (ev) => { const t = ev.touches[0]; toque = { x: t.clientX, y: t.clientY }; }, { passive: true });
    zonaBanners.addEventListener("touchend", (ev) => {
        if (!toque) return;
        const t = ev.changedTouches[0];
        const dx = t.clientX - toque.x;
        const dy = t.clientY - toque.y;
        toque = null;
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) irBanner(pasoBanner + (dx < 0 ? 1 : -1));
    });
    pintarBotonPausa();
    pintarBanners();
    programar();

    /* ---------------------------------------------------------------- Marcas */
    const pistaMarcas = $(".marcas-pista");
    const tarjetaMarca = (m, copia) => {
        const a = crear("a", { class: `marca-logo${m.oscura ? " oscura" : ""}`, title: m.nombre });
        enlazarBusqueda(a, m.nombre);
        a.append(crear("img", { src: `../website_supricom_tienda/static/src/img/marcas/${m.logo}`, alt: copia ? "" : m.nombre, style: `height:${m.alto}px` }));
        if (copia) { a.setAttribute("aria-hidden", "true"); a.tabIndex = -1; }
        return a;
    };
    // Dos filas en sentidos contrarios. Las dos mitades de cada cinta tienen que ser iguales y cubrir pantallas anchas.
    const unJuego = D.marcas.length * 194;
    const juegos = Math.max(1, Math.ceil(window.screen.width / unJuego));
    const filas = [[pistaMarcas, D.marcas], [$(".marcas-pista-inversa"), [...D.marcas].reverse()]];
    filas.forEach(([pista, lista], f) => {
        for (let k = 0; k < juegos * 2; k++) for (const m of lista) pista.append(tarjetaMarca(m, f > 0 || k > 0));
        pista.style.setProperty("--duracion-cinta", `${(44 + f * 8) * juegos}s`);
    });

    // La cinta se puede pausar (se mueve sola); la elección se recuerda.
    const seccionMarcas = $(".marcas");
    const botonPausaMarcas = $(".marcas-pausa");
    const pausarMarcas = (si) => {
        seccionMarcas.classList.toggle("pausado", si);
        botonPausaMarcas.setAttribute("aria-pressed", String(si));
        botonPausaMarcas.textContent = si ? "Mover las marcas" : "Pausar las marcas";
    };
    let marcasQuietas = false;
    try { marcasQuietas = localStorage.getItem("supricom-marcas-quietas") === "1"; } catch (e) { /* sin almacenamiento */ }
    pausarMarcas(marcasQuietas);
    if (QUIETO) botonPausaMarcas.hidden = true;
    botonPausaMarcas.addEventListener("click", () => {
        marcasQuietas = !marcasQuietas;
        pausarMarcas(marcasQuietas);
        try { localStorage.setItem("supricom-marcas-quietas", marcasQuietas ? "1" : "0"); } catch (e) { /* sin almacenamiento */ }
    });

    /* ---------------------------------------------------------------- Categorías */
    const seccionCats = $(".categorias");
    const fijaCats = $(".categorias-fija");
    const pistaCats = $(".categorias-pista");
    for (const c of D.categorias) {
        const a = crear("a", { class: "cat" }, [
            crear("h3", { text: c.nombre }),
            crear("div", { class: "cat-foto" }, [crear("img", { src: foto(c.foto), alt: "", loading: "lazy" })]),
            crear("span", { class: "cat-ir" }, ["Ver productos ", icono("ir", "icono-ir")]),
        ]);
        enlazarBusqueda(a, FICHAS ? c.buscar : c.nombre);
        pistaCats.append(a);
    }
    let sobranteCats = 0;
    const medirCats = () => {
        if (!escritorio() || QUIETO) {
            seccionCats.style.removeProperty("--alto-categorias");
            sobranteCats = 0;
            pistaCats.style.transform = "";
            return;
        }
        sobranteCats = Math.max(0, pistaCats.scrollWidth - window.innerWidth);
        seccionCats.style.setProperty("--alto-categorias", `${window.innerHeight + sobranteCats * 0.5}px`);
    };
    // Con Tab el navegador movería la fila de lado; en su lugar se baja la página hasta la tarjeta.
    fijaCats.addEventListener("scroll", () => { fijaCats.scrollLeft = 0; });
    pistaCats.addEventListener("focusin", (ev) => {
        const cat = ev.target.closest(".cat");
        if (!cat || sobranteCats <= 0) return;
        fijaCats.scrollLeft = 0;
        const x = Math.min(sobranteCats, Math.max(0, cat.offsetLeft - (window.innerWidth - cat.offsetWidth) / 2));
        window.scrollTo({ top: seccionCats.offsetTop + x * 0.5, behavior: "instant" });
    });

    // Inclinación 3D de las tarjetas de categoría y de servicio siguiendo el mouse.
    if (!QUIETO) {
        for (const el of $$(".cat")) {
            el.addEventListener("mousemove", (ev) => {
                const r = el.getBoundingClientRect();
                const x = (ev.clientX - r.left) / r.width - 0.5;
                const y = (ev.clientY - r.top) / r.height - 0.5;
                el.style.setProperty("--rx", `${-y * 10}deg`);
                el.style.setProperty("--ry", `${x * 12}deg`);
            });
            el.addEventListener("mouseleave", () => { el.style.setProperty("--rx", "0deg"); el.style.setProperty("--ry", "0deg"); });
        }
    }

    /* ---------------------------------------------------------------- Scroll: categorías y pasos */
    const seccionComprar = $(".comprar");
    const pasosLi = $$(".paso", seccionComprar);
    const alScroll = () => {
        const y = window.scrollY;
        const rComprar = seccionComprar.getBoundingClientRect(); // se lee antes de escribir estilos
        cabecera.classList.toggle("con-scroll", y > 8);
        if (sobranteCats > 0) {
            const k = Math.min(1, Math.max(0, (y - seccionCats.offsetTop) / (sobranteCats * 0.5)));
            pistaCats.style.transform = `translateX(${-k * sobranteCats}px)`;
            seccionCats.style.setProperty("--avance-cats", String(k));
        }
        const k = Math.min(1, Math.max(0, (window.innerHeight * 0.75 - rComprar.top) / (rComprar.height * 0.6)));
        seccionComprar.style.setProperty("--avance-pasos", String(k));
        pasosLi.forEach((li, i) => li.classList.toggle("listo", k >= (i + 0.5) / pasosLi.length));
        if (escritorio() && !QUIETO) arrancar(); // el giro del anillo sigue al scroll
    };
    let pendiente = false;
    window.addEventListener("scroll", () => {
        if (pendiente) return;
        pendiente = true;
        requestAnimationFrame(() => { pendiente = false; alScroll(); });
    }, { passive: true });
    window.addEventListener("resize", () => { medirCats(); alScroll(); });
    window.addEventListener("load", () => { medirCats(); alScroll(); });
    medirCats();
    alScroll();

    /* ---------------------------------------------------------------- Cotización */
    // La cotización es una lista código → unidades que se guarda en el navegador, una por sede. Se suma con
    // «+ Cotizar» desde cualquier tarjeta, con el buscador (que también acepta una lista de códigos pegada)
    // o con las sugerencias de lo que se pide junto.
    const porCodigo = new Map(D.productos.map((p) => [p.codigo.toUpperCase(), p]));
    const porId = new Map(D.productos.map((p) => [p.id, p]));
    const MAX_CANT = 99999;
    const CLAVE_COTIZACION = `supricom-cotizacion-${SEDE.id}`;
    const nombreDe = (codigo) => { const p = porCodigo.get(codigo); return p ? `${p.marca} ${p.nombre}` : codigo; };
    const unidadesTxt = (n) => `${miles(n)} ${n === 1 ? "unidad" : "unidades"}`;
    const anuncio = $("#pedido-anuncio");
    // Solo para lectores de pantalla y solo cuando la persona hace algo.
    const anunciar = (t) => { anuncio.textContent = ""; requestAnimationFrame(() => { anuncio.textContent = t; }); };
    const svg = (clase, d) => {
        const e = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        e.setAttribute("viewBox", "0 0 24 24");
        e.setAttribute("aria-hidden", "true");
        e.setAttribute("class", clase);
        e.innerHTML = `<path d="${d}"/>`;
        return e;
    };
    const ICONO_MAS = "M12 5v14M5 12h14";
    const ICONO_LISTO = "m5 12.5 4.5 4.5L19 7.5";
    const botonAgregar = (p, texto = "Cotizar") => crear("button", {
        type: "button", class: "agregar", "data-agregar": p.codigo.toUpperCase(),
    }, [svg("icono-mas", ICONO_MAS), svg("icono-listo", ICONO_LISTO), crear("span", { text: texto })]);

    // Lo que ya llevaba: si viene de cambiar de sede, esa; si no, la que guardó antes en esta sede.
    const cotizacion = new Map();
    let cambiosEnEstaVisita = false;
    // Se juntan las dos: lo guardado en esta sede y lo que viene de otra (de cada código, la cantidad mayor).
    const cargarCotizacion = () => {
        const leer = (texto) => {
            try {
                for (const [c, n] of JSON.parse(texto || "[]")) {
                    const k = typeof c === "string" ? c.toUpperCase() : "";
                    const cant = Math.min(MAX_CANT, parseInt(n, 10));
                    // Un código de otra sede puede traer espacios o paréntesis: llega igual, «por revisar».
                    if (k && (porCodigo.has(k) || /^[A-Z0-9][\w./()\- ]{0,48}$/.test(k)) && cant > 0) cotizacion.set(k, Math.max(cotizacion.get(k) || 0, cant));
                }
            } catch (e) { /* esa fuente no se entiende: se ignora */ }
        };
        let viaja = null;
        try { leer(localStorage.getItem(CLAVE_COTIZACION)); } catch (e) { /* sin almacenamiento */ }
        try { viaja = sessionStorage.getItem(CLAVE_LISTA); sessionStorage.removeItem(CLAVE_LISTA); } catch (e) { /* sin almacenamiento */ }
        if (viaja) { leer(viaja); guardarCotizacion(); }
    };
    const guardarCotizacion = () => {
        try { localStorage.setItem(CLAVE_COTIZACION, JSON.stringify([...cotizacion])); } catch (e) { /* sin almacenamiento */ }
    };
    enLaSede.lista = () => (cotizacion.size ? JSON.stringify([...cotizacion]) : null);
    enLaSede.usada = () => cambiosEnEstaVisita;

    /* Lectura de una lista pegada: "COD 12", "COD;12", "COD,12", "COD x12", miles con punto ("COD 1.000") y
       filas de Excel (tabuladas: el código es la primera celda y la cantidad, la última que sea un número). */
    const IGNORADA = /^(total(es)?|sub-?total|sku|c[oó]digos?|codes?|ref(erencia)?|items?|art[ií]culos?|cant(idad)?|qty|descripci[oó]n|productos?)$/i;
    const CODIGO = /^[A-Za-z0-9][\w./-]*$/;
    const NUMERO = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,0+)?$/;
    const aCantidad = (t) => (t ? parseInt(t.replace(/,0+$/, "").replace(/\./g, ""), 10) : 1);
    // Códigos de Odoo con espacios o paréntesis («HALO H60X(2-PACK)»): se reconocen enteros antes que nada.
    const conEspacios = [...porCodigo.keys()].filter((k) => !CODIGO.test(k)).sort((a, b) => b.length - a.length);
    // `col`: posición de las columnas de código y cantidad, si la lista trae encabezados (Excel).
    const leerLinea = (l, col = {}) => {
        if (IGNORADA.test(l.split(/[\s,;:\t]+/)[0])) return { ignorar: true };
        const u = l.toUpperCase();
        const largo = conEspacios.find((k) => u === k || (u.startsWith(k) && /^[\s,;:\t]/.test(u.slice(k.length))));
        if (largo) {
            const resto = l.slice(largo.length).replace(/^[\s,;:\t]*(?:[x×*]\s*)?/i, "");
            const cant = aCantidad(resto.split(/[\t\s]+/).find((x) => NUMERO.test(x)));
            return cant > 0 ? { codigo: largo, cant } : null;
        }
        let codigo;
        let cant;
        if (l.includes("\t")) {
            const celdas = l.split("\t").map((s) => s.trim());
            // La columna del código: la del encabezado; si no, la que es un código de la página; si no, la que
            // parece un código (letras y números); si no, la primera que no es solo un número.
            let i = col.cod ?? celdas.findIndex((c) => porCodigo.has(c.toUpperCase()));
            if (i < 0) i = celdas.findIndex((c) => CODIGO.test(c) && /[A-Za-z]/.test(c) && /\d/.test(c));
            if (i < 0) i = celdas.findIndex((c) => CODIGO.test(c) && !NUMERO.test(c));
            if (i < 0 || !celdas[i]) return null;
            codigo = celdas[i];
            // La cantidad: la de su columna; si no, el primer número después del código (no el precio del final).
            cant = aCantidad(col.cant != null ? celdas[col.cant] : celdas.slice(i + 1).find((c) => NUMERO.test(c)));
        } else {
            const m = l.match(/^([A-Za-z0-9][\w./-]*)[\s,;:]*(?:[x×*]\s*)?(\d{1,3}(?:\.\d{3})+|\d+)?\s*$/i);
            if (!m) return null;
            codigo = m[1];
            cant = aCantidad(m[2]);
        }
        return cant > 0 ? { codigo: codigo.toUpperCase(), cant } : null;
    };

    /* ---- El carrito: panel lateral que se abre desde la cabecera */
    const carrito = $("#carrito");
    const botonCarrito = $(".carrito-boton");
    const numeroCarrito = $(".carrito-n");
    const avisoCarrito = $(".carrito-aviso");
    let carritoAbierto = false;
    let focoAntes = null;
    let relojAviso = 0;
    const cerrarAvisoCarrito = () => { clearTimeout(relojAviso); avisoCarrito.hidden = true; };
    const abrirCarrito = (enfocar) => {
        cerrarAvisoCarrito();
        if (!carritoAbierto) {
            if (menu.classList.contains("abierto")) cerrarMenu(false); // si no, queda abierto detrás del panel
            carritoAbierto = true;
            focoAntes = document.activeElement;
            carrito.inert = false;
            document.body.classList.add("carrito-abierto");
            document.documentElement.classList.add("carrito-abierto"); // bloquea el scroll de la página
            botonCarrito.setAttribute("aria-expanded", "true");
        }
        (enfocar || $(".carrito-cerrar")).focus({ preventScroll: true });
    };
    const cerrarCarrito = (devolverFoco = true) => {
        if (!carritoAbierto) return;
        carritoAbierto = false;
        document.body.classList.remove("carrito-abierto");
        document.documentElement.classList.remove("carrito-abierto");
        botonCarrito.setAttribute("aria-expanded", "false");
        carrito.inert = true;
        // El foco vuelve a donde estaba; si eso ya no se ve (el aviso que se cerró), al botón del carrito.
        if (devolverFoco) (focoAntes && focoAntes.isConnected && focoAntes.offsetParent !== null ? focoAntes : botonCarrito).focus({ preventScroll: true });
    };
    botonCarrito.setAttribute("aria-expanded", "false");
    botonCarrito.addEventListener("click", () => abrirCarrito());
    $(".carrito-cerrar").addEventListener("click", () => cerrarCarrito());
    $(".carrito-fondo").addEventListener("click", () => cerrarCarrito());
    // Es un diálogo: el foco da la vuelta adentro (aunque se haya hecho clic en una parte sin controles) y Escape lo
    // cierra, salvo que el buscador lo haya usado para cerrar su lista. No sigue a los otros Escape de la página.
    document.addEventListener("keydown", (ev) => {
        if (!carritoAbierto) return;
        if (ev.key === "Escape") {
            if (!ev.defaultPrevented) { ev.preventDefault(); ev.stopImmediatePropagation(); cerrarCarrito(); }
            return;
        }
        if (ev.key !== "Tab") return;
        const enfocables = $$("button, a[href], input, [tabindex='0']", carrito).filter((e) => !e.disabled && e.offsetParent !== null);
        if (!enfocables.length) return;
        const primero = enfocables[0];
        const ultimo = enfocables[enfocables.length - 1];
        const dentro = carrito.contains(document.activeElement);
        if (ev.shiftKey && (!dentro || document.activeElement === primero)) { ev.preventDefault(); ultimo.focus(); }
        else if (!ev.shiftKey && (!dentro || document.activeElement === ultimo)) { ev.preventDefault(); primero.focus(); }
    }, true);

    // Aviso al sumar con el carrito cerrado: qué se agregó y un botón para verlo. Se va solo, salvo que se haya
    // sumado con el teclado (así se alcanza «Ver carrito» con Tab); Escape lo cierra.
    const mostrarAvisoCarrito = (fotoId, nombre) => {
        if (carritoAbierto || menu.classList.contains("abierto")) return;
        const conTeclado = document.activeElement && document.activeElement !== document.body && document.activeElement.matches(":focus-visible");
        clearTimeout(relojAviso);
        $(".carrito-aviso-foto").src = foto(fotoId);
        $(".carrito-aviso-nombre").textContent = nombre;
        avisoCarrito.hidden = true;
        void avisoCarrito.offsetWidth; // vuelve a correr la animación de entrada
        avisoCarrito.hidden = false;
        if (!conTeclado) relojAviso = setTimeout(cerrarAvisoCarrito, 4500);
    };
    const rearmarAviso = () => {
        clearTimeout(relojAviso);
        if (!avisoCarrito.hidden && !avisoCarrito.contains(document.activeElement)) relojAviso = setTimeout(cerrarAvisoCarrito, 2500);
    };
    avisoCarrito.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") clearTimeout(relojAviso); });
    avisoCarrito.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") rearmarAviso(); });
    avisoCarrito.addEventListener("focusin", () => clearTimeout(relojAviso));
    avisoCarrito.addEventListener("focusout", (e) => { if (!avisoCarrito.contains(e.relatedTarget)) { clearTimeout(relojAviso); relojAviso = setTimeout(cerrarAvisoCarrito, 2500); } });
    document.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && !avisoCarrito.hidden && !carritoAbierto) cerrarAvisoCarrito(); });
    $(".carrito-aviso-ver").addEventListener("click", () => abrirCarrito());

    /* ---- La lista de la cotización */
    const lineasTicket = $(".ticket-lineas");
    const vacioTicket = $(".ticket-vacio");
    const resumen = $("#pedido-resumen");
    const enviar = $(".pedido-enviar");
    const avisoLargo = $(".ticket-largo");
    const botonDeshacer = $('[data-accion="deshacer"]');
    const botonVaciar = $('[data-accion="vaciar"]');
    const totalLineas = $$('[data-total="lineas"]'); // en el dibujo y en el pie
    const totalUnidades = $$('[data-total="unidades"]');
    const sugeridos = $(".sugeridos");
    const listaSugeridos = $(".sugeridos-lista");
    let listaParaCopiar = null;
    enviar.classList.toggle("por-whatsapp", POR_WHATSAPP);

    const filasTicket = new Map();
    const nuevaFila = (codigo) => {
        const p = porCodigo.get(codigo);
        const nombre = nombreDe(codigo);
        return crear("div", { class: `linea-pedido${p ? "" : " desconocido"}`, role: "listitem", "data-codigo": codigo }, [
            p ? crear("img", { src: foto(p.id, 128), alt: "", loading: "lazy" }) : crear("span", { class: "linea-icono", "aria-hidden": "true" }, [icono("revisar")]),
            crear("div", { class: "linea-texto" }, [
                crear("strong", { text: nombre }),
                crear("small", { text: p ? codigo : "Código por revisar: tu vendedor lo confirma" }),
            ]),
            crear("div", { class: "contador", role: "group", "aria-label": `Cantidad de ${nombre}` }, [
                crear("button", { type: "button", class: "contador-menos", "aria-label": `Una unidad menos de ${nombre}` }, [icono("menos")]),
                crear("input", { type: "number", inputMode: "numeric", min: 1, max: MAX_CANT, "aria-label": `Unidades de ${nombre}` }),
                crear("button", { type: "button", class: "contador-mas", "aria-label": `Una unidad más de ${nombre}` }, [icono("mas")]),
            ]),
            crear("button", { type: "button", class: "linea-quitar", "aria-label": `Quitar ${nombre}` }, [svg("", "M6 6l12 12M18 6 6 18")]),
        ]);
    };

    // Venta cruzada: lo que más sale en las mismas facturas que lo que ya lleva.
    const conQue = new Map((S.juntos || []).map((j) => [j.id, j.con]));
    const pintarSugeridos = () => {
        const puntos = new Map();
        for (const c of cotizacion.keys()) {
            const p = porCodigo.get(c);
            (p ? conQue.get(p.id) || [] : []).forEach((id, k) => puntos.set(id, (puntos.get(id) || 0) + (3 - Math.min(k, 2))));
        }
        const lista = [...puntos].sort((a, b) => b[1] - a[1]).map(([id]) => porId.get(id))
            .filter((p) => p && !cotizacion.has(p.codigo.toUpperCase())).slice(0, 4);
        sugeridos.hidden = !lista.length;
        listaSugeridos.replaceChildren(...lista.map((p) => crear("button", {
            type: "button", class: "sugerido", "data-agregar": p.codigo.toUpperCase(), "aria-label": `Sumar ${p.marca} ${p.nombre}`,
        }, [crear("img", { src: foto(p.id, 128), alt: "", loading: "lazy" }), crear("span", { text: `${p.marca} ${p.nombre}` }), icono("mas")])));
    };

    // Todos los botones «+ Cotizar» de la página muestran si ese producto ya está y cuántas unidades lleva.
    const marcarBotones = () => {
        for (const b of $$(".agregar[data-agregar], .ficha-cotizar[data-agregar]")) {
            const n = cotizacion.get(b.dataset.agregar) || 0;
            b.classList.toggle("en-cotizacion", n > 0);
            const visible = n ? `Llevas ${miles(n)}` : (b.dataset.texto || "Cotizar");
            const texto = $("span", b);
            if (texto) texto.textContent = visible;
            // El nombre empieza por lo que se ve (para quien usa la voz) y dice el producto y el estado.
            const p = porCodigo.get(b.dataset.agregar);
            const prod = p ? `${p.marca} ${p.nombre}` : b.dataset.agregar;
            b.setAttribute("aria-label", n ? `${visible} de ${prod} en el carrito. Sumar otra unidad` : `${visible} ${prod}`);
        }
    };
    // Los combos dicen si ya están todos en el carrito; el cierre ofrece volver a la cotización.
    const marcarCombos = () => {
        for (const b of $$("[data-combo]")) {
            const combo = (S.combos || [])[Number(b.dataset.combo)];
            const ps = combo ? combo.ids.map((id) => porId.get(id)).filter(Boolean) : [];
            const todos = ps.length > 0 && ps.every((p) => cotizacion.has(p.codigo.toUpperCase()));
            b.classList.toggle("en-cotizacion", todos);
            $("span", b).textContent = todos ? "Combo en el carrito" : `Agregar el combo (${ps.length})`;
            b.setAttribute("aria-label", todos ? `Combo ${combo.titulo} en el carrito. Agregar los que falten` : `Agregar el combo ${combo ? combo.titulo : ""}: ${ps.length} productos`);
        }
        const cierre = $(".cierre-carrito");
        cierre.hidden = !cotizacion.size;
        $(".cierre-carrito-n").textContent = miles([...cotizacion.values()].reduce((a, b) => a + b, 0));
    };
    enLaSede.marcar = () => { marcarBotones(); marcarCombos(); };
    $(".cierre-carrito").addEventListener("click", () => abrirCarrito());

    // El número del carrito en la cabecera: las unidades que llevas.
    const pintarBotonCarrito = () => {
        const u = [...cotizacion.values()].reduce((a, b) => a + b, 0);
        numeroCarrito.hidden = !u;
        numeroCarrito.textContent = u > 999 ? "999+" : miles(u);
        botonCarrito.setAttribute("aria-label", u
            ? `Abrir el carrito: ${cotizacion.size} ${cotizacion.size === 1 ? "producto" : "productos"}, ${unidadesTxt(u)}`
            : "Abrir el carrito (vacío)");
    };

    let primeraVez = true;
    const pintar = () => {
        for (const [c, fila] of filasTicket) if (!cotizacion.has(c)) { fila.remove(); filasTicket.delete(c); }
        const texto = [`Hola, quiero cotizar en la sede ${S.nombre}:`, ""];
        const corto = []; // para el correo: solo código y cantidad, sin acentos ni signos que alarguen el enlace
        let anterior = null;
        let unidades = 0;
        let porRevisar = 0;
        for (const [codigo, cant] of cotizacion) {
            let fila = filasTicket.get(codigo);
            if (!fila) {
                fila = nuevaFila(codigo);
                filasTicket.set(codigo, fila);
                if (!primeraVez) fila.classList.add("entra");
            }
            const esperado = anterior ? anterior.nextElementSibling : lineasTicket.firstElementChild;
            if (esperado !== fila) lineasTicket.insertBefore(fila, esperado);
            const campo = $("input", fila);
            if (document.activeElement !== campo) campo.value = String(cant);
            $(".contador-menos", fila).setAttribute("aria-disabled", String(cant <= 1));
            anterior = fila;
            unidades += cant;
            const p = porCodigo.get(codigo);
            if (!p) porRevisar += 1;
            texto.push(p ? `• ${codigo} × ${cant} — ${p.marca} ${p.nombre}` : `• ${codigo} × ${cant} — (código por revisar)`);
            corto.push(`${codigo} x ${cant}${p ? "" : " (por revisar)"}`);
        }
        const n = cotizacion.size;
        vacioTicket.hidden = n > 0;
        botonVaciar.hidden = !n;
        for (const e of totalLineas) e.textContent = miles(n);
        for (const e of totalUnidades) e.textContent = miles(unidades);
        listaParaCopiar = null;
        if (n) {
            texto.push("", `Total: ${n} ${n === 1 ? "producto" : "productos"}, ${unidadesTxt(unidades)}.`);
            if (POR_WHATSAPP) enviar.href = cotizar(texto.join("\n"));
            else {
                const cuerpo = [`Hola, quiero cotizar en la sede ${S.nombre}:`, "", ...corto, "", `Total: ${n} productos, ${unidades} unidades.`].join("\n");
                // Los programas de correo cortan los enlaces de más de unos 2.000 caracteres: con una lista larga
                // el correo se abre con un saludo y la lista se copia para pegarla.
                const url = cotizar(cuerpo);
                if (url.length <= 1800) enviar.href = url;
                else {
                    listaParaCopiar = cuerpo;
                    enviar.href = cotizar(`Hola, quiero cotizar en la sede ${S.nombre}. Pego abajo mi lista de ${n} productos:\n\n`);
                }
            }
            for (const a of ["role", "tabindex", "aria-disabled", "aria-describedby"]) enviar.removeAttribute(a);
        } else {
            // Sin href el enlace no es un control: con role y tabindex se puede alcanzar y se anuncia como no disponible.
            enviar.removeAttribute("href");
            enviar.setAttribute("role", "link");
            enviar.setAttribute("tabindex", "0");
            enviar.setAttribute("aria-disabled", "true");
            enviar.setAttribute("aria-describedby", "enviar-ayuda");
        }
        avisoLargo.hidden = !listaParaCopiar;
        resumen.textContent = porRevisar ? `${porRevisar} ${porRevisar === 1 ? "código" : "códigos"} por revisar: tu vendedor los confirma.` : "";
        pintarSugeridos();
        marcarBotones();
        marcarCombos();
        pintarBotonCarrito();
        primeraVez = false;
    };

    const cambio = () => {
        cambiosEnEstaVisita = true;
        if (respaldo && cotizacion.size) { respaldo = null; botonDeshacer.hidden = true; }
        guardarCotizacion();
        pintar();
    };
    const poner = (codigo, n) => {
        if (n > 0) cotizacion.set(codigo, Math.min(MAX_CANT, n));
        else cotizacion.delete(codigo);
    };

    // La foto del producto vuela hasta el botón del carrito de la cabecera (con el panel abierto no hace falta). El origen se
    // mide antes de cambiar nada, porque al repintar la tarjeta de origen puede desaparecer (las sugerencias).
    const prepararVuelo = (img) => {
        if (QUIETO || !img || !img.isConnected) return null;
        const o = img.getBoundingClientRect();
        return o.width ? { o, src: img.currentSrc || img.src } : null;
    };
    const volar = (vuelo0) => {
        if (!vuelo0) return;
        const { o } = vuelo0;
        if (carritoAbierto) return;
        const destino = botonCarrito;
        const d = destino.getBoundingClientRect();
        const g = crear("img", { class: "vuela", src: vuelo0.src, alt: "" });
        g.style.left = `${o.left + o.width / 2 - 32}px`;
        g.style.top = `${o.top + o.height / 2 - 32}px`;
        document.body.append(g);
        const dx = d.left + d.width / 2 - (o.left + o.width / 2);
        const dy = d.top + d.height / 2 - (o.top + o.height / 2);
        const vuelo = g.animate([
            { transform: "translate(0, 0) scale(1)", opacity: 1 },
            { transform: `translate(${dx * 0.55}px, ${dy * 0.55 - 90}px) scale(.85) rotate(-8deg)`, opacity: 1, offset: 0.55 },
            { transform: `translate(${dx}px, ${dy}px) scale(.25) rotate(6deg)`, opacity: 0.3 },
        ], { duration: 780, easing: "cubic-bezier(.45, 0, .25, 1)" });
        vuelo.onfinish = () => {
            g.remove();
            botonCarrito.classList.remove("salta"); void botonCarrito.offsetWidth; botonCarrito.classList.add("salta");
        };
    };
    const agregarProducto = (p, img) => {
        const codigo = p.codigo.toUpperCase();
        const vuelo = prepararVuelo(img);
        poner(codigo, (cotizacion.get(codigo) || 0) + 1);
        cambio();
        volar(vuelo);
        mostrarAvisoCarrito(p.id, `${p.marca} ${p.nombre}`);
        anunciar(`Agregado al carrito: ${p.marca} ${p.nombre}. Llevas ${unidadesTxt(cotizacion.get(codigo))}.`);
    };
    enLaSede.agregar = (p, img) => agregarProducto(p, img);

    // Cualquier botón con data-agregar suma una unidad de ese producto; un combo suma todos los suyos.
    document.addEventListener("click", (ev) => {
        const b = ev.target.closest("[data-agregar], [data-combo]");
        if (!b) return;
        if (b.dataset.combo !== undefined) {
            const combo = (S.combos || [])[Number(b.dataset.combo)];
            const lista = combo ? combo.ids.map((id) => porId.get(id)).filter(Boolean) : [];
            const vuelo = prepararVuelo(b.closest(".combo")?.querySelector("img"));
            for (const p of lista) { const c = p.codigo.toUpperCase(); if (!cotizacion.has(c)) poner(c, 1); }
            cambio();
            volar(vuelo);
            if (lista.length) mostrarAvisoCarrito(lista[0].id, `Combo: ${combo.titulo} (${lista.length})`);
            anunciar(`Agregado al carrito el combo ${combo ? combo.titulo : ""}: ${lista.length} productos.`);
            return;
        }
        const p = porCodigo.get(b.dataset.agregar);
        if (!p) return;
        const img = b.closest(".prod, .sugerido")?.querySelector("img")
            || (b.classList.contains("ficha-cotizar") ? $(".orbita-item[tabindex='0'] img") : null);
        // Una sugerencia desaparece al sumarla: el foco pasa a la siguiente (o al buscador si no quedan).
        const posSugerido = b.classList.contains("sugerido") ? [...listaSugeridos.children].indexOf(b) : -1;
        agregarProducto(p, img);
        if (posSugerido >= 0) {
            const siguiente = listaSugeridos.children[Math.min(posSugerido, listaSugeridos.children.length - 1)];
            (siguiente && !sugeridos.hidden ? siguiente : buscador).focus();
        }
    });

    // Cantidades, quitar y vaciar desde la lista.
    const cambiar = (codigo, nueva) => {
        if (!cotizacion.has(codigo)) return;
        const final = Math.min(MAX_CANT, nueva);
        poner(codigo, final);
        cambio();
        anunciar(final > 0 ? `${nombreDe(codigo)}: ${unidadesTxt(final)}` : `Quitado: ${nombreDe(codigo)}`);
    };
    lineasTicket.addEventListener("click", (ev) => {
        const b = ev.target.closest("button");
        if (!b) return;
        const fila = b.closest(".linea-pedido");
        const codigo = fila.dataset.codigo;
        const actual = cotizacion.get(codigo) || 0;
        if (b.classList.contains("contador-mas")) cambiar(codigo, actual + 1);
        else if (b.classList.contains("contador-menos")) { if (actual > 1) cambiar(codigo, actual - 1); }
        else if (b.classList.contains("linea-quitar")) {
            const siguiente = fila.nextElementSibling || fila.previousElementSibling;
            cambiar(codigo, 0);
            (siguiente && siguiente.isConnected ? $(".linea-quitar", siguiente) : buscador).focus();
        }
    });
    // Escribir una cantidad: se guarda con Enter o al salir; vacío o 0 vuelve a lo que había.
    const guardarCampo = (campo) => {
        const codigo = campo.closest(".linea-pedido").dataset.codigo;
        const n = parseInt(campo.value, 10);
        const antes = cotizacion.get(codigo);
        if (n > 0 && n !== antes) cambiar(codigo, n);
        campo.value = String(cotizacion.get(codigo) || antes || 1);
    };
    lineasTicket.addEventListener("change", (ev) => { if (ev.target.matches(".contador input")) guardarCampo(ev.target); });
    lineasTicket.addEventListener("keydown", (ev) => {
        if (ev.key !== "Enter" || !ev.target.matches(".contador input")) return;
        ev.preventDefault();
        guardarCampo(ev.target);
        ev.target.select();
    });
    let respaldo = null;
    botonVaciar.addEventListener("click", () => {
        respaldo = [...cotizacion];
        cotizacion.clear();
        cambiosEnEstaVisita = true;
        guardarCotizacion();
        pintar();
        botonDeshacer.hidden = false;
        botonDeshacer.focus();
        anunciar("Carrito vacío. Puedes deshacerlo.");
    });
    botonDeshacer.addEventListener("click", () => {
        if (!respaldo) return;
        for (const [c, n] of respaldo) cotizacion.set(c, n);
        respaldo = null;
        botonDeshacer.hidden = true;
        guardarCotizacion();
        pintar();
        buscador.focus();
        anunciar("Carrito recuperado.");
    });
    // Con una lista larga el correo se abre con un saludo: la lista se copia para pegarla.
    enviar.addEventListener("click", () => {
        if (!listaParaCopiar || !navigator.clipboard) return;
        navigator.clipboard.writeText(listaParaCopiar)
            .then(() => anunciar("Lista copiada: pégala en el correo."))
            .catch(() => anunciar("No pudimos copiar la lista: tu cotización sigue aquí para copiarla a mano."));
    });

    /* ---- Buscador: un producto por nombre, marca o código; o una lista de códigos pegada */
    const buscador = $("#buscar-codigo");
    const panelBusqueda = $(".buscador-panel");
    const opciones = $("#buscar-opciones");
    const sinResultados = $(".opcion-nada");
    const enlaceCatalogo = $(".buscador-catalogo");
    const estadoBusqueda = $("#buscar-estado");
    const ayudaBusqueda = $("#buscar-ayuda");
    const AYUDA = ayudaBusqueda.textContent;
    const normal = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const indice = D.productos.map((p) => ({ p, t: normal(`${p.marca} ${p.nombre} ${p.codigo} ${nombreCategoria[p.cat] || ""}`) }));
    let resultados = [];
    let opcionActiva = -1;
    let esperaAviso;
    const avisar = (t) => { clearTimeout(esperaAviso); esperaAviso = setTimeout(() => { estadoBusqueda.textContent = t; }, 400); };
    const marcar = (i) => {
        opcionActiva = i;
        $$('[role="option"]', opciones).forEach((o, k) => o.setAttribute("aria-selected", String(k === i)));
        if (i >= 0) {
            buscador.setAttribute("aria-activedescendant", `opcion-${i}`);
            opciones.children[i].scrollIntoView({ block: "nearest" });
        } else buscador.removeAttribute("aria-activedescendant");
    };
    const cerrarBusqueda = () => {
        panelBusqueda.hidden = true;
        buscador.setAttribute("aria-expanded", "false");
        clearTimeout(esperaAviso);
        estadoBusqueda.textContent = "";
        marcar(-1);
    };
    // Un código que no está en la página igual se puede pedir: queda «por revisar».
    const pareceCodigo = (q) => CODIGO.test(q) && /\d/.test(q) && q.length >= 4 && !/\s/.test(q);
    // «M0H54ALP 12»: un código (de la página o con forma de código) seguido de su cantidad.
    const lineaConCantidad = (q) => {
        if (!/[\s;,:×*]/.test(q)) return null;
        const r = leerLinea(q);
        return r && !r.ignorar && (porCodigo.has(r.codigo) || pareceCodigo(r.codigo)) && /\d\s*$/.test(q) ? r : null;
    };
    const sugerir = () => {
        const escrito = buscador.value.trim();
        if (!escrito) { cerrarBusqueda(); return; }
        // Con «código cantidad» se busca solo el código.
        const conCant = lineaConCantidad(escrito);
        const q = conCant ? conCant.codigo : escrito;
        const palabras = normal(q).split(/\s+/);
        resultados = indice.filter((x) => palabras.every((w) => x.t.includes(w))).slice(0, 6).map((x) => x.p);
        opciones.replaceChildren(...resultados.map((p, i) => crear("li", { id: `opcion-${i}`, role: "option", "aria-selected": "false", "data-i": String(i) }, [
            crear("img", { src: foto(p.id), alt: "", loading: "lazy" }),
            crear("span", {}, [crear("strong", { text: `${p.marca} ${p.nombre}` }), crear("small", { text: p.codigo })]),
            crear("span", { class: "opcion-mas", "aria-hidden": "true" }, [icono(cotizacion.has(p.codigo.toUpperCase()) ? "listo" : "mas")]),
        ])));
        const hay = resultados.length > 0;
        opciones.hidden = !hay;
        sinResultados.hidden = hay;
        sinResultados.textContent = pareceCodigo(q)
            ? `No está en esta página. Pulsa Enter para pedir «${q.toUpperCase()}» igual: tu vendedor lo confirma.`
            : "No está entre los productos de esta página.";
        enlaceCatalogo.hidden = !FICHAS;
        if (FICHAS) { enlaceCatalogo.href = buscar(q); enlaceCatalogo.replaceChildren(`Buscar «${q}» en todo el catálogo `, icono("ir", "icono-ir")); }
        panelBusqueda.hidden = false;
        buscador.setAttribute("aria-expanded", String(hay));
        marcar(-1);
        avisar(hay
            ? `${resultados.length} ${resultados.length === 1 ? "producto" : "productos"}. Usa las flechas para elegir y Enter para agregar.`
            : sinResultados.textContent);
    };
    const agregarDesdeBuscador = (p) => {
        const img = opciones.querySelector(`[data-i="${resultados.indexOf(p)}"] img`);
        agregarProducto(p, img);
        buscador.value = "";
        cerrarBusqueda();
    };
    // Pegar una lista (varias líneas o filas de Excel) la suma completa.
    const sumarLista = (textoLista) => {
        let sumados = 0;
        let revisar = 0;
        let malas = 0;
        // Si la primera fila de Excel son encabezados, dicen dónde están el código y la cantidad.
        const lineas = textoLista.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
        const col = {};
        if (lineas[0] && lineas[0].includes("\t")) {
            const celdas = lineas[0].split("\t").map((s) => normal(s.trim()));
            const cod = celdas.findIndex((c) => /^(codigo|cod\.?|sku|ref(erencia)?|n[°º]?\s*(de\s*)?parte|part\s*number|modelo)$/.test(c));
            const cant = celdas.findIndex((c) => /^(cant(idad)?\.?|qty|unidades|und\.?)$/.test(c));
            if ((cod >= 0 || cant >= 0) && !celdas.some((c) => porCodigo.has(c.toUpperCase()))) {
                if (cod >= 0) col.cod = cod;
                if (cant >= 0) col.cant = cant;
                lineas.shift();
            }
        }
        for (const l of lineas) {
            const r = leerLinea(l, col);
            if (!r) { malas += 1; continue; }
            if (r.ignorar) continue;
            poner(r.codigo, (cotizacion.get(r.codigo) || 0) + r.cant);
            sumados += 1;
            if (!porCodigo.has(r.codigo)) revisar += 1;
        }
        if (sumados) cambio();
        const partes = [`Sumamos ${sumados} ${sumados === 1 ? "producto" : "productos"} de tu lista`];
        if (revisar) partes.push(`${revisar} por revisar`);
        if (malas) partes.push(`${malas} ${malas === 1 ? "línea" : "líneas"} sin entender`);
        const t = `${partes.join(" · ")}.`;
        ayudaBusqueda.textContent = t;
        clearTimeout(sumarLista.reloj);
        sumarLista.reloj = setTimeout(() => { ayudaBusqueda.textContent = AYUDA; }, 6000);
        anunciar(t);
    };
    buscador.addEventListener("paste", (ev) => {
        const t = (ev.clipboardData || window.clipboardData)?.getData("text") || "";
        if (!/[\n\t]/.test(t.trim()) && !lineaConCantidad(t.trim())) return; // un solo código sin cantidad: se busca normal
        ev.preventDefault();
        sumarLista(t);
        buscador.value = "";
        cerrarBusqueda();
    });
    buscador.addEventListener("input", sugerir);
    buscador.addEventListener("focus", () => { if (buscador.value.trim()) sugerir(); });
    buscador.addEventListener("keydown", (ev) => {
        if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
            if (panelBusqueda.hidden) sugerir();
            if (!resultados.length) return;
            ev.preventDefault();
            // Recorre -1 (ninguna, se sigue escribiendo) y las opciones, dando la vuelta.
            const n = resultados.length + 1;
            const paso = ev.key === "ArrowDown" ? 1 : -1;
            marcar(((opcionActiva + 1 + paso + n) % n) - 1);
        } else if (ev.key === "Enter") {
            const q = buscador.value.trim();
            if (lineaConCantidad(q) && opcionActiva < 0) {
                ev.preventDefault();
                sumarLista(q);
                buscador.value = "";
                cerrarBusqueda();
            } else if (!panelBusqueda.hidden && resultados.length) {
                ev.preventDefault();
                agregarDesdeBuscador(resultados[opcionActiva >= 0 ? opcionActiva : 0]);
            } else if (pareceCodigo(q)) {
                ev.preventDefault();
                sumarLista(q);
                buscador.value = "";
                cerrarBusqueda();
            }
        } else if (ev.key === "Escape" && !panelBusqueda.hidden) {
            ev.preventDefault();
            cerrarBusqueda();
        }
    });
    // El foco se queda en el buscador al tocar el panel; si no, Safari (que no enfoca enlaces al hacer
    // clic) lo cerraría antes de que llegue el clic al enlace del catálogo.
    panelBusqueda.addEventListener("mousedown", (ev) => ev.preventDefault());
    opciones.addEventListener("click", (ev) => {
        const li = ev.target.closest('[role="option"]');
        if (li) agregarDesdeBuscador(resultados[Number(li.dataset.i)]);
    });
    $(".buscador").addEventListener("focusout", (ev) => {
        if (!ev.currentTarget.contains(ev.relatedTarget)) cerrarBusqueda();
    });
    // En las sedes sin tienda propia, las categorías, marcas y banners buscan aquí.
    enLaSede.buscar = (q) => {
        if (!q) { $("#estantes").scrollIntoView({ behavior: QUIETO ? "auto" : "smooth", block: "start" }); return; }
        buscador.value = q;
        abrirCarrito(buscador);
        sugerir();
    };

    /* ---------------------------------------------------------------- Estantes */
    const LISTAS = {
        masVendidos: { chip: (i) => `N.º ${i + 1}`, clase: "", nota: "Ordenados por cuántas facturas tuvieron en los últimos 90 días." },
        novedades: { chip: () => "Nuevo", clase: "nuevo", nota: "Llegaron en los últimos dos meses y medio." },
        menosRotan: { chip: () => "Oportunidad", clase: "oportunidad", nota: "En existencia, para sumar a tu próximo pedido." },
    };
    const pistaEstante = $(".estante-pista");
    const notaEstante = $(".estante-nota");
    const pestanasEstante = $$(".estantes-pestanas [role='tab']");
    const tarjetaProducto = (p, lista, i) => {
        const imagen = crear("img", { src: foto(p.id), alt: "", loading: "lazy" });
        const marco = FICHAS
            ? crear("a", { class: "prod-foto", href: ficha(p.id), tabIndex: -1, "aria-hidden": "true" }, [imagen])
            : crear("div", { class: "prod-foto" }, [imagen]);
        const pie = [botonAgregar(p)];
        if (FICHAS) pie.unshift(crear("a", { class: "prod-ver", href: ficha(p.id), text: "Ver ficha", "aria-label": `Ver la ficha de ${p.marca} ${p.nombre}` }));
        const t = crear("article", { class: "prod" }, [
            crear("span", { class: `prod-chip ${LISTAS[lista].clase}`, text: LISTAS[lista].chip(i) }),
            marco,
            crear("div", { class: "prod-texto" }, [
                crear("p", { class: "prod-marca", text: p.marca }),
                crear("h3", { class: "prod-nombre", text: p.nombre }),
                crear("p", { class: "prod-codigo", text: p.codigo }),
            ]),
            crear("div", { class: "prod-pie" }, pie),
        ]);
        t.style.setProperty("--i", String(i));
        return t;
    };
    // Cada tarjeta gira según qué tan lejos está del centro de la fila: un abanico que se mueve al deslizar.
    const girarEstante = () => {
        if (QUIETO) return;
        const izq = pistaEstante.scrollLeft;
        const ancho = pistaEstante.clientWidth;
        const tarjetas = [...pistaEstante.children];
        const ks = tarjetas.map((c) => Math.max(-1, Math.min(1, (c.offsetLeft - izq + c.offsetWidth / 2 - ancho / 2) / (ancho / 2))));
        tarjetas.forEach((c, i) => {
            c.style.setProperty("--giro", `${(-ks[i] * 16).toFixed(2)}deg`);
            c.style.setProperty("--hondo", `${(-Math.abs(ks[i]) * 36).toFixed(1)}px`);
        });
    };
    const flechasEstante = $$(".flecha-estante");
    const pintarFlechasEstante = () => {
        const max = pistaEstante.scrollWidth - pistaEstante.clientWidth - 2;
        flechasEstante[0].disabled = pistaEstante.scrollLeft <= 2;
        flechasEstante[1].disabled = pistaEstante.scrollLeft >= max;
    };
    let giroPendiente = false;
    pistaEstante.addEventListener("scroll", () => {
        if (giroPendiente) return;
        giroPendiente = true;
        requestAnimationFrame(() => { giroPendiente = false; girarEstante(); pintarFlechasEstante(); });
    }, { passive: true });
    window.addEventListener("resize", () => { girarEstante(); pintarFlechasEstante(); });
    for (const f of flechasEstante) {
        f.addEventListener("click", () => {
            const tarjeta = pistaEstante.firstElementChild;
            const paso = tarjeta ? tarjeta.getBoundingClientRect().width + 18 : 260;
            pistaEstante.scrollBy({ left: Number(f.dataset.mover) * paso * 2, behavior: QUIETO ? "auto" : "smooth" });
        });
    }
    const mostrarLista = (lista) => {
        const ids = S[lista] || [];
        pistaEstante.replaceChildren(...ids.map((id) => porId.get(id)).filter(Boolean).map((p, i) => tarjetaProducto(p, lista, i)));
        pistaEstante.scrollLeft = 0;
        notaEstante.textContent = LISTAS[lista].nota;
        for (const t of pestanasEstante) {
            const activa = t.dataset.lista === lista;
            t.setAttribute("aria-selected", String(activa));
            t.tabIndex = activa ? 0 : -1;
            if (activa) $("#estante").setAttribute("aria-labelledby", t.id);
        }
        marcarBotones();
        requestAnimationFrame(() => { girarEstante(); pintarFlechasEstante(); });
    };
    // Una pestaña sin productos no se muestra (por ejemplo, una sede sin novedades).
    for (const t of pestanasEstante) t.hidden = !(S[t.dataset.lista] || []).length;
    const visibles = pestanasEstante.filter((t) => !t.hidden);
    for (const t of visibles) {
        t.addEventListener("click", () => mostrarLista(t.dataset.lista));
        t.addEventListener("keydown", (ev) => {
            if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight" && ev.key !== "Home" && ev.key !== "End") return;
            ev.preventDefault();
            const i = visibles.indexOf(t);
            const j = ev.key === "Home" ? 0 : ev.key === "End" ? visibles.length - 1
                : (i + (ev.key === "ArrowRight" ? 1 : -1) + visibles.length) % visibles.length;
            visibles[j].focus();
            mostrarLista(visibles[j].dataset.lista);
        });
    }
    if (visibles.length) mostrarLista(visibles[0].dataset.lista);
    else $("#estantes").hidden = true;

    /* ---------------------------------------------------------------- Se piden juntos */
    const contenedorCombos = $(".combos");
    (S.combos || []).forEach((combo, k) => {
        const lista = combo.ids.map((id) => porId.get(id)).filter(Boolean);
        if (lista.length < 2) return;
        const fotos = lista.map((p, i) => {
            const x = i - (lista.length - 1) / 2;
            const img = crear("img", { src: foto(p.id), alt: "", loading: "lazy" });
            img.style.setProperty("--x", String(x));
            img.style.setProperty("--z", String(Math.abs(x)));
            img.style.zIndex = String(10 - Math.round(Math.abs(x) * 2));
            return img;
        });
        const tarjeta = crear("article", { class: "combo aparece visible" }, [
            crear("div", { class: "combo-abanico", "aria-hidden": "true" }, fotos),
            crear("h3", { class: "combo-titulo", text: combo.titulo }),
            crear("ul", { class: "combo-lista" }, lista.map((p) => crear("li", { text: `${p.marca} ${p.nombre}` }))),
            crear("button", { type: "button", class: "agregar", "data-combo": String(k), "aria-label": `Agregar el combo ${combo.titulo}: ${lista.length} productos` },
                [svg("icono-mas", ICONO_MAS), svg("icono-listo", ICONO_LISTO), crear("span", { text: `Agregar el combo (${lista.length})` })]),
        ]);
        contenedorCombos.append(tarjeta);
    });
    if (!contenedorCombos.children.length) $("#juntos").hidden = true;

    cargarCotizacion();
    pintar();
    // Un enlace que termina en #carrito abre la página con el carrito abierto.
    if (location.hash === "#carrito") abrirCarrito();
})();
