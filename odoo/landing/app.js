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
    const foto = (id) => `${D.odoo}/web/image/product.template/${id}/image_512`;
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
    // Odoo tiene una sola tienda, con la existencia de Valencia: en las sedes sin tienda propia una ficha
    // diría «Agotado» aunque la sede lo tenga. Ahí los productos van a la lista de cotización y las
    // categorías, marcas y banners se buscan entre los productos de la sede (los arma la sección de la lista).
    const FICHAS = Boolean(S.tiendaPropia);
    const enLaSede = { agregar: () => {}, buscar: () => {} };
    // Enlace a una búsqueda: en la tienda si la sede tiene la suya; si no, en el buscador de la lista.
    const enlazarBusqueda = (a, q) => {
        if (FICHAS) { a.href = buscar(q); return; }
        a.href = "#pedido";
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
    document.title = `SUPRICOM ${S.nombre} · Tecnología al mayor`;
    for (const el of $$("[data-sede]")) {
        const v = {
            nombre: S.nombre, documento: S.documento, marcas: miles(S.marcas), medio: MEDIO,
            medioTitulo: MEDIO.charAt(0).toUpperCase() + MEDIO.slice(1),
            lugar: S.nombre === S.pais ? S.nombre : `${S.nombre} · ${S.pais}`,
        }[el.dataset.sede];
        if (v !== undefined) el.textContent = v;
    }
    for (const el of $$("[data-solo-whatsapp]")) el.hidden = !POR_WHATSAPP;
    for (const el of $$("[data-solo-correo]")) el.hidden = POR_WHATSAPP;

    // Sedes: la elegida primero y marcada; las otras con un enlace para cambiarse.
    const grillaSedes = $(".sedes-grilla");
    for (const id of [SEDE.id, ...IDS_SEDE.filter((x) => x !== SEDE.id)]) {
        const s = TODO.sedes[id];
        const actual = id === SEDE.id;
        const hijos = [
            crear("p", { class: "sede-pais", text: s.pais }),
            crear("h3", { text: s.nombre }),
        ];
        if (actual) hijos.unshift(crear("span", { class: "sede-marca", text: "Tu sede" }));
        if (s.telefono) hijos.push(crear("p", {}, [crear("a", { href: `tel:${s.telefono.replace(/[^\d+]/g, "")}`, text: s.telefono })]));
        hijos.push(crear("p", {}, [crear("a", { href: `mailto:${s.correo}`, text: s.correo })]));
        if (!actual) {
            const ir = crear("a", { class: "sede-ir", href: `?sede=${id}`, text: `Ver los productos de ${s.nombre} →` });
            ir.addEventListener("click", (ev) => { ev.preventDefault(); irASede(id); });
            hijos.push(ir);
        }
        grillaSedes.append(crear("article", { class: `sede aparece${actual ? " sede-actual" : ""}` }, hijos));
    }
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
        if (guardar) { try { localStorage.setItem("supricom-tema", t); } catch (e) { /* sin almacenamiento: dura hasta recargar */ } }
    };
    ponerTema(raiz.getAttribute("data-tema") === "oscuro" ? "oscuro" : "claro", false);
    botonTema.addEventListener("click", () => ponerTema(raiz.getAttribute("data-tema") === "oscuro" ? "claro" : "oscuro", true));
    sistemaOscuro.addEventListener("change", (e) => { if (!guardado()) ponerTema(e.matches ? "oscuro" : "claro", false); });

    /* ---------------------------------------------------------------- Selector de sede y ubicación */
    const selectorSede = $("#sede");
    const botonUbicar = $(".sede-ubicar");
    const avisoSede = $(".sede-aviso");
    const textoAvisoSede = $(".sede-aviso-texto");
    const botonCambiarAviso = $(".sede-aviso-cambiar");
    const CLAVE_LISTA = "supricom-lista";
    for (const id of IDS_SEDE) selectorSede.append(crear("option", { value: id, text: TODO.sedes[id].nombre }));
    selectorSede.value = SEDE.id;
    // Un enlace con ?sede= cuenta como elección si el visitante todavía no tenía una.
    if (SEDE.origen === "enlace" && !TODO.sedes[sedeGuardada()]) guardarSede(SEDE.id);
    // Cambiar de sede recarga la página con ?sede= (enlace que se puede compartir) y la recuerda.
    // La lista de códigos que ya escribió viaja con él.
    const irASede = (id) => {
        guardarSede(id);
        if (id === SEDE.id) return;
        const lista = $("#codigos").value;
        try { if (lista.trim() && lista !== LISTA_INICIAL) sessionStorage.setItem(CLAVE_LISTA, lista); } catch (e) { /* sin almacenamiento: la lista no viaja */ }
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
        || $("#codigos").value !== LISTA_INICIAL
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
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !avisoSede.hidden) aceptarSede(false); });
    document.addEventListener("click", (e) => { if (!avisoSede.hidden && !e.target.closest(".sede-selector")) aceptarSede(false); });
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
        if (abierto) cerrarAviso(); // el aviso de sede taparía los primeros enlaces
        menuBoton.setAttribute("aria-expanded", String(abierto));
        menuBoton.setAttribute("aria-label", abierto ? "Cerrar menú" : "Abrir menú");
    });
    for (const a of $$("a", menu)) a.addEventListener("click", () => cerrarMenu(false));
    $(".menu-ubicar").addEventListener("click", (ev) => { ev.stopPropagation(); cerrarMenu(false); ubicar(true); });
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
        ficha_.ver.href = FICHAS ? ficha(p.id) : "#pedido";
        ficha_.cotizar.href = cotizar(`Hola, quiero cotizar en la sede ${S.nombre}: ${p.codigo} (${p.marca} ${p.nombre})`);
        minis.forEach((b, k) => b.setAttribute("aria-current", String(k === i)));
    };
    const paso = 360 / enAnillo.length;
    const items = enAnillo.map((p, i) => {
        const a = crear("a", { class: "orbita-item", href: FICHAS ? ficha(p.id) : "#pedido", draggable: false, "aria-label": FICHAS ? `${p.marca} ${p.nombre}` : `Agregar ${p.marca} ${p.nombre} a mi lista` }, [
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
    const giroScroll = () => (escritorio() && !QUIETO ? window.scrollY * 0.08 : 0);
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
        else if (!FICHAS) { ev.preventDefault(); enLaSede.agregar(enAnillo[i]); }
    }, true);
    if (!FICHAS) {
        ficha_.ver.textContent = "Agregar a mi lista";
        ficha_.ver.addEventListener("click", (ev) => { ev.preventDefault(); enLaSede.agregar(enAnillo[frenteActual]); });
    }
    orbita.addEventListener("pointerenter", () => { pausaAnillo = true; });
    orbita.addEventListener("pointerleave", () => { pausaAnillo = false; arrancar(); });
    orbita.addEventListener("focusin", () => { pausaAnillo = true; });
    orbita.addEventListener("focusout", () => { pausaAnillo = false; arrancar(); });
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
    const banners = D.banners.map((b, i) => {
        const a = crear("a", { class: "banner", "aria-roledescription": "diapositiva", "aria-label": `${i + 1} de ${nB}: ${b.alt}` },
            [crear("img", { src: b.img, alt: "", draggable: false })]);
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
        if (QUIETO || enPausa() || nB < 2) return;
        reloj = setTimeout(() => irBanner(pasoBanner + 1), INTERVALO);
    };
    const botonesBanner = D.banners.map((b, i) => {
        const btn = crear("button", { type: "button", text: b.nombre });
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

    /* ---------------------------------------------------------------- Categorías */
    const seccionCats = $(".categorias");
    const fijaCats = $(".categorias-fija");
    const pistaCats = $(".categorias-pista");
    for (const c of D.categorias) {
        const a = crear("a", { class: "cat" }, [
            crear("h3", { text: c.nombre }),
            crear("div", { class: "cat-foto" }, [crear("img", { src: foto(c.foto), alt: "", loading: "lazy" })]),
            crear("span", { class: "cat-ir", text: "Ver productos →" }),
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
        seccionCats.style.setProperty("--alto-categorias", `${window.innerHeight + sobranteCats}px`);
    };
    // Con Tab el navegador movería la fila de lado; en su lugar se baja la página hasta la tarjeta.
    fijaCats.addEventListener("scroll", () => { fijaCats.scrollLeft = 0; });
    pistaCats.addEventListener("focusin", (ev) => {
        const cat = ev.target.closest(".cat");
        if (!cat || sobranteCats <= 0) return;
        fijaCats.scrollLeft = 0;
        const x = Math.min(sobranteCats, Math.max(0, cat.offsetLeft - (window.innerWidth - cat.offsetWidth) / 2));
        window.scrollTo({ top: seccionCats.offsetTop + x, behavior: "instant" });
    });

    // Inclinación 3D de las tarjetas de categoría y de servicio siguiendo el mouse.
    if (!QUIETO) {
        for (const el of $$(".cat, .servicio")) {
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
            const k = Math.min(1, Math.max(0, (y - seccionCats.offsetTop) / sobranteCats));
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

    /* ---------------------------------------------------------------- Lista de códigos */
    // El texto del editor es lo que vale: el ticket se arma desde él y, al tocar una cantidad en el ticket,
    // se vuelve a escribir el texto.
    const areaCodigos = $("#codigos");
    const margen = $(".editor-margen");
    const erroresCodigos = $("#codigos-errores");
    const lineasTicket = $(".ticket-lineas");
    const vacioTicket = $(".ticket-vacio");
    const resumen = $("#pedido-resumen");
    const anuncio = $("#pedido-anuncio");
    const enviar = $(".pedido-enviar");
    const avisoLargo = $(".ticket-largo");
    let listaParaCopiar = null;
    const botonDeshacer = $('[data-accion="deshacer"]');
    const totalLineas = $('[data-total="lineas"]');
    const totalUnidades = $('[data-total="unidades"]');
    const porCodigo = new Map(D.productos.map((p) => [p.codigo.toUpperCase(), p]));
    const MAX_CANT = 99999;
    // La lista de muestra sale de los destacados de la sede, con varias formas de escribirla y un código ajeno.
    const muestra = D.categorias.map((c) => destacadoDe(c.id).codigo);
    const LISTA_INICIAL = [`${muestra[0]} 12`, `${muestra[1]} 6`, `${muestra[3] || muestra[2]} 40`].join("\n");
    const EJEMPLO = [`${muestra[0]} 12`, `${muestra[1]} x 6`, `${muestra[2]};40`, `${muestra[4] || muestra[3]} 15`, "LAMP-0042 3"].join("\n");
    // Si viene de cambiar de sede, recupera la lista que tenía escrita.
    let listaQueViaja = null;
    try { listaQueViaja = sessionStorage.getItem(CLAVE_LISTA); sessionStorage.removeItem(CLAVE_LISTA); } catch (e) { /* sin almacenamiento */ }
    areaCodigos.value = listaQueViaja || LISTA_INICIAL;
    $(".ticket-fecha").textContent = new Date().toLocaleDateString("es-VE", { day: "numeric", month: "long", year: "numeric" });
    const nombreDe = (codigo) => { const p = porCodigo.get(codigo); return p ? `${p.marca} ${p.nombre}` : codigo; };
    const unidadesTxt = (n) => `${miles(n)} ${n === 1 ? "unidad" : "unidades"}`;
    // Solo para lectores de pantalla y solo cuando la persona hace algo en el ticket (no mientras escribe).
    const anunciar = (t) => { anuncio.textContent = ""; requestAnimationFrame(() => { anuncio.textContent = t; }); };

    // Encabezados y totales que trae una lista copiada de Excel: no son productos.
    const IGNORADA = /^(total(es)?|sub-?total|sku|c[oó]digos?|codes?|ref(erencia)?|items?|art[ií]culos?|cant(idad)?|qty|descripci[oó]n|productos?)$/i;
    const CODIGO = /^[A-Za-z0-9][\w./-]*$/;
    const NUMERO = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,0+)?$/;
    const aCantidad = (t) => (t ? parseInt(t.replace(/,0+$/, "").replace(/\./g, ""), 10) : 1);
    // Acepta "COD 12", "COD;12", "COD,12", "COD x12", "COD ×12", miles con punto ("COD 1.000")
    // y filas de Excel (separadas por tabulador): el código es la primera celda y la cantidad, la última que sea un número.
    const leerLinea = (l) => {
        if (IGNORADA.test(l.split(/[\s,;:\t]+/)[0])) return { ignorar: true };
        let codigo;
        let cant;
        if (l.includes("\t")) {
            const celdas = l.split("\t").map((s) => s.trim()).filter(Boolean);
            if (!CODIGO.test(celdas[0] || "")) return null;
            codigo = celdas[0];
            cant = aCantidad(celdas.slice(1).reverse().find((c) => NUMERO.test(c)));
        } else {
            const m = l.match(/^([A-Za-z0-9][\w./-]*)[\s,;:]*(?:[x×*]\s*)?(\d{1,3}(?:\.\d{3})+|\d+)?\s*$/i);
            if (!m) return null;
            codigo = m[1];
            cant = aCantidad(m[2]);
        }
        return cant > 0 ? { codigo: codigo.toUpperCase(), cant } : null;
    };
    // El pedido (código → cantidad, en el orden en que aparece), el estado de cada renglón y lo que no se entendió.
    const analizar = () => {
        const pedido = new Map();
        const estados = [];
        const sueltas = [];
        const noEntendidas = [];
        let recortado = false;
        for (const bruta of areaCodigos.value.split("\n")) {
            const l = bruta.trim();
            if (!l) { estados.push(""); continue; }
            const r = leerLinea(l);
            if (!r) { estados.push("error"); sueltas.push(l); noEntendidas.push(l); continue; }
            if (r.ignorar) { estados.push("ignorada"); continue; } // al reescribir desde el ticket se descarta
            estados.push(porCodigo.has(r.codigo) ? "ok" : "nuevo");
            const suma = (pedido.get(r.codigo) || 0) + r.cant;
            if (suma > MAX_CANT) recortado = true;
            pedido.set(r.codigo, Math.min(MAX_CANT, suma));
        }
        return { pedido, estados, sueltas, noEntendidas, recortado };
    };
    // Las líneas que no se entendieron quedan al final, tal cual, para que el cliente las corrija.
    const escribir = (pedido, sueltas) => {
        areaCodigos.value = [...[...pedido].map(([c, n]) => `${c} ${n}`), ...sueltas].join("\n");
        pintar();
    };

    // El margen va fuera del flujo y copia el alto de la barra horizontal del textarea para no desfasarse.
    const calzarMargen = () => {
        const barra = areaCodigos.offsetHeight - areaCodigos.clientHeight;
        margen.style.paddingBottom = `${14 + Math.max(0, barra)}px`;
        margen.scrollTop = areaCodigos.scrollTop;
    };
    if ("ResizeObserver" in window) new ResizeObserver(calzarMargen).observe(areaCodigos);

    const iconoQuitar = () => {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("aria-hidden", "true");
        svg.innerHTML = '<path d="M6 6l12 12M18 6 6 18"/>';
        return svg;
    };
    const filasTicket = new Map();
    const nuevaFila = (codigo) => {
        const p = porCodigo.get(codigo);
        const nombre = nombreDe(codigo);
        return crear("div", { class: `linea-pedido${p ? "" : " desconocido"}`, role: "listitem", "data-codigo": codigo }, [
            p ? crear("img", { src: foto(p.id), alt: "", loading: "lazy" }) : crear("span", { class: "linea-icono", "aria-hidden": "true", text: "?" }),
            crear("div", { class: "linea-texto" }, [
                crear("strong", { text: nombre }),
                crear("small", { text: p ? codigo : "No está en esta lista: tu vendedor lo revisa" }),
            ]),
            crear("div", { class: "contador", role: "group", "aria-label": `Cantidad de ${nombre}` }, [
                crear("button", { type: "button", class: "contador-menos", "aria-label": `Una unidad menos de ${nombre}`, text: "−" }),
                crear("input", { type: "number", inputMode: "numeric", min: 1, max: MAX_CANT, "aria-label": `Unidades de ${nombre}` }),
                crear("button", { type: "button", class: "contador-mas", "aria-label": `Una unidad más de ${nombre}`, text: "+" }),
            ]),
            crear("button", { type: "button", class: "linea-quitar", "aria-label": `Quitar ${nombre}` }, [iconoQuitar()]),
        ]);
    };

    let primeraVez = true;
    const pintar = () => {
        const { pedido, estados, noEntendidas, recortado } = analizar();
        const renglones = areaCodigos.value.split("\n");

        // Margen: número de renglón y su estado (color y, en los errores, un signo).
        margen.replaceChildren(...estados.map((e, i) => crear("span", { class: e ? `est-${e}` : "", text: String(i + 1) })));
        calzarMargen();
        // Las líneas que no se entienden, con su número, para quien no ve los colores.
        const malas = estados.flatMap((e, i) => (e === "error" ? [i] : []));
        erroresCodigos.hidden = !malas.length;
        erroresCodigos.textContent = malas.map((i) => `Línea ${i + 1} sin entender: «${renglones[i].trim()}».`).join(" ");
        if (malas.length) areaCodigos.setAttribute("aria-invalid", "true");
        else areaCodigos.removeAttribute("aria-invalid");

        // Ticket: las filas se reusan para no perder el foco al cambiar una cantidad.
        for (const [c, fila] of filasTicket) if (!pedido.has(c)) { fila.remove(); filasTicket.delete(c); }
        const texto = [`Hola, quiero cotizar en la sede ${S.nombre}:`, ""];
        const corto = []; // para el correo: solo código y cantidad, sin acentos ni signos que alarguen el enlace
        let anterior = null;
        let unidades = 0;
        let reconocidos = 0;
        for (const [codigo, cant] of pedido) {
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
            if (p) reconocidos += 1;
            texto.push(p ? `• ${codigo} × ${cant} — ${p.marca} ${p.nombre}` : `• ${codigo} × ${cant} — (código por revisar)`);
            corto.push(`${codigo} x ${cant}${p ? "" : " (por revisar)"}`);
        }

        const n = pedido.size;
        vacioTicket.hidden = n > 0;
        totalLineas.textContent = miles(n);
        totalUnidades.textContent = miles(unidades);
        if (n) {
            texto.push("", `Total: ${n} ${n === 1 ? "producto" : "productos"}, ${unidadesTxt(unidades)}.`);
            // Lo que no se entendió también va, para que el vendedor lo vea y pregunte.
            if (noEntendidas.length) texto.push("", "Líneas que no se entendieron:", ...noEntendidas.map((l) => `- ${l}`));
            listaParaCopiar = null;
            if (POR_WHATSAPP) enviar.href = cotizar(texto.join("\n"));
            else {
                const total = `Total: ${n} ${n === 1 ? "producto" : "productos"}, ${unidades} unidades.`;
                const extra = noEntendidas.length ? ["", "Lineas que no se entendieron:", ...noEntendidas.map((l) => `- ${l}`)] : [];
                const cuerpo = [`Hola, quiero cotizar en la sede ${S.nombre}:`, "", ...corto, "", total, ...extra].join("\n");
                // Los programas de correo cortan los enlaces de más de unos 2.000 caracteres: con una lista
                // larga el correo se abre con un saludo y la lista se copia para pegarla.
                const url = cotizar(cuerpo);
                if (url.length <= 1800) enviar.href = url;
                else {
                    listaParaCopiar = cuerpo;
                    enviar.href = cotizar(`Hola, quiero cotizar en la sede ${S.nombre}. Pego abajo mi lista de ${n} productos:\n\n`);
                }
            }
            avisoLargo.hidden = !listaParaCopiar;
            for (const a of ["role", "tabindex", "aria-disabled", "aria-describedby"]) enviar.removeAttribute(a);
        } else {
            // Sin href el enlace no es un control: con role y tabindex se puede alcanzar y se anuncia como no disponible.
            enviar.removeAttribute("href");
            listaParaCopiar = null;
            avisoLargo.hidden = true;
            enviar.setAttribute("role", "link");
            enviar.setAttribute("tabindex", "0");
            enviar.setAttribute("aria-disabled", "true");
            enviar.setAttribute("aria-describedby", "enviar-ayuda");
        }
        const partes = [];
        if (n) partes.push(`${reconocidos} de ${n} ${n === 1 ? "código reconocido" : "códigos reconocidos"}`);
        if (malas.length) partes.push(`${malas.length} ${malas.length === 1 ? "línea" : "líneas"} sin entender`);
        if (recortado) partes.push(`máximo ${miles(MAX_CANT)} unidades por producto`);
        resumen.textContent = partes.join(" · ");
        primeraVez = false;
    };

    // Cambia la cantidad de un código desde el ticket (0 = quitarlo).
    const cambiar = (codigo, nueva) => {
        const { pedido, sueltas } = analizar();
        if (!pedido.has(codigo)) return;
        const final = Math.min(MAX_CANT, nueva);
        if (final > 0) pedido.set(codigo, final);
        else pedido.delete(codigo);
        escribir(pedido, sueltas);
        anunciar(final > 0 ? `${nombreDe(codigo)}: ${unidadesTxt(final)}` : `Quitado: ${nombreDe(codigo)}`);
    };
    lineasTicket.addEventListener("click", (ev) => {
        const b = ev.target.closest("button");
        if (!b) return;
        const fila = b.closest(".linea-pedido");
        const codigo = fila.dataset.codigo;
        const actual = analizar().pedido.get(codigo) || 0;
        if (b.classList.contains("contador-mas")) cambiar(codigo, actual + 1);
        else if (b.classList.contains("contador-menos")) { if (actual > 1) cambiar(codigo, actual - 1); }
        else if (b.classList.contains("linea-quitar")) {
            const siguiente = fila.nextElementSibling || fila.previousElementSibling;
            cambiar(codigo, 0);
            (siguiente && siguiente.isConnected ? $(".linea-quitar", siguiente) : areaCodigos).focus();
        }
    });
    // Escribir una cantidad: se guarda con Enter o al salir; vacío o 0 vuelve a lo que había.
    const guardarCampo = (campo) => {
        const codigo = campo.closest(".linea-pedido").dataset.codigo;
        const n = parseInt(campo.value, 10);
        const antes = analizar().pedido.get(codigo);
        if (n > 0 && n !== antes) cambiar(codigo, n);
        campo.value = String(analizar().pedido.get(codigo) || antes || 1);
    };
    lineasTicket.addEventListener("change", (ev) => { if (ev.target.matches(".contador input")) guardarCampo(ev.target); });
    lineasTicket.addEventListener("keydown", (ev) => {
        if (ev.key !== "Enter" || !ev.target.matches(".contador input")) return;
        ev.preventDefault();
        guardarCampo(ev.target);
        ev.target.select();
    });

    // «Usar un ejemplo» y «Limpiar» reemplazan la lista: se guarda la anterior para poder deshacerlo.
    let respaldo = null;
    const reemplazar = (valor) => {
        const antes = areaCodigos.value;
        respaldo = antes.trim() && antes !== valor ? antes : null;
        botonDeshacer.hidden = respaldo === null;
        areaCodigos.value = valor;
        pintar();
        areaCodigos.focus();
        if (respaldo !== null) anunciar(valor ? "Lista reemplazada por el ejemplo. Puedes deshacerlo." : "Lista borrada. Puedes deshacerlo.");
    };
    for (const b of $$('[data-accion="ejemplo"]')) b.addEventListener("click", () => reemplazar(EJEMPLO));
    $('[data-accion="limpiar"]').addEventListener("click", () => reemplazar(""));
    botonDeshacer.addEventListener("click", () => {
        if (respaldo === null) return;
        areaCodigos.value = respaldo;
        respaldo = null;
        botonDeshacer.hidden = true;
        pintar();
        areaCodigos.focus();
        anunciar("Lista recuperada.");
    });
    $('[data-accion="cambiar-sede"]').addEventListener("click", (ev) => {
        ev.stopPropagation(); // si no, el clic llega al documento y cierra el aviso que se abre aquí
        selectorSede.focus({ preventScroll: true });
        let abierto = false;
        if (typeof selectorSede.showPicker === "function") { try { selectorSede.showPicker(); abierto = true; } catch (e) { /* sin gesto válido */ } }
        // Safari no tiene showPicker: se indica dónde está la lista.
        if (!abierto) mostrarAviso("Elige tu sede en la lista de arriba. Tu lista de códigos se mantiene.");
    });
    // Con una lista larga el correo se abre con un saludo: la lista se copia para pegarla.
    enviar.addEventListener("click", () => {
        if (!listaParaCopiar || !navigator.clipboard) return;
        navigator.clipboard.writeText(listaParaCopiar)
            .then(() => anunciar("Lista copiada: pégala en el correo."))
            .catch(() => anunciar("No pudimos copiar la lista: cópiala del editor y pégala en el correo."));
    });
    areaCodigos.addEventListener("scroll", () => { margen.scrollTop = areaCodigos.scrollTop; });
    let espera;
    areaCodigos.addEventListener("input", () => {
        if (respaldo !== null) { respaldo = null; botonDeshacer.hidden = true; }
        clearTimeout(espera);
        espera = setTimeout(pintar, 150);
    });
    // Al salir del editor se anuncia cómo quedó, en vez de hablar con cada tecla.
    areaCodigos.addEventListener("blur", () => { clearTimeout(espera); pintar(); if (resumen.textContent) anunciar(resumen.textContent); });

    /* Buscador entre los productos de esta página (los más pedidos); lo demás, en la tienda. */
    const buscador = $("#buscar-codigo");
    const panelBusqueda = $(".buscador-panel");
    const opciones = $("#buscar-opciones");
    const sinResultados = $(".opcion-nada");
    const enlaceCatalogo = $(".buscador-catalogo");
    const estadoBusqueda = $("#buscar-estado");
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
    const sugerir = () => {
        const q = buscador.value.trim();
        if (!q) { cerrarBusqueda(); return; }
        const palabras = normal(q).split(/\s+/);
        resultados = indice.filter((x) => palabras.every((w) => x.t.includes(w))).slice(0, 6).map((x) => x.p);
        opciones.replaceChildren(...resultados.map((p, i) => crear("li", { id: `opcion-${i}`, role: "option", "aria-selected": "false", "data-i": String(i) }, [
            crear("img", { src: foto(p.id), alt: "", loading: "lazy" }),
            crear("span", {}, [crear("strong", { text: `${p.marca} ${p.nombre}` }), crear("small", { text: p.codigo })]),
            crear("span", { class: "opcion-mas", "aria-hidden": "true", text: "+" }),
        ])));
        const hay = resultados.length > 0;
        opciones.hidden = !hay;          // un listbox vacío no se muestra ni se anuncia
        sinResultados.hidden = hay;
        enlaceCatalogo.href = buscar(q);
        enlaceCatalogo.textContent = `Buscar «${q}» en todo el catálogo →`;
        panelBusqueda.hidden = false;
        buscador.setAttribute("aria-expanded", String(hay));
        marcar(-1);
        avisar(hay
            ? `${resultados.length} ${resultados.length === 1 ? "producto" : "productos"} entre los más pedidos. Usa las flechas para elegir y Enter para agregar.`
            : `Sin resultados entre los más pedidos. Pulsa Tab para buscar «${q}» en todo el catálogo.`);
    };
    const agregar = (p) => {
        const codigo = p.codigo.toUpperCase();
        const { pedido, sueltas } = analizar();
        pedido.set(codigo, Math.min(MAX_CANT, (pedido.get(codigo) || 0) + 1));
        escribir(pedido, sueltas);
        buscador.value = "";
        cerrarBusqueda();
        const fila = filasTicket.get(codigo);
        if (fila) fila.scrollIntoView({ block: "nearest", behavior: QUIETO ? "auto" : "smooth" });
        anunciar(`Agregado: ${p.marca} ${p.nombre}, ${unidadesTxt(pedido.get(codigo))}`);
    };
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
            if (!panelBusqueda.hidden && resultados.length) {
                ev.preventDefault();
                agregar(resultados[opcionActiva >= 0 ? opcionActiva : 0]);
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
        if (li) agregar(resultados[Number(li.dataset.i)]);
    });
    $(".buscador").addEventListener("focusout", (ev) => {
        if (!ev.currentTarget.contains(ev.relatedTarget)) cerrarBusqueda();
    });

    // Lo que usan el anillo, las categorías, las marcas y los banners en las sedes sin tienda propia.
    enLaSede.agregar = (p) => {
        agregar(p);
        $("#pedido").scrollIntoView({ behavior: QUIETO ? "auto" : "smooth", block: "start" });
    };
    enLaSede.buscar = (q) => {
        if (!q) { $("#destacados").scrollIntoView({ behavior: QUIETO ? "auto" : "smooth", block: "start" }); return; }
        $(".buscador").scrollIntoView({ behavior: QUIETO ? "auto" : "smooth", block: "center" });
        buscador.value = q;
        buscador.focus({ preventScroll: true });
        sugerir();
    };

    pintar();
})();
