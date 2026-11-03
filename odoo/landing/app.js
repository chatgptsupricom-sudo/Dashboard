/* SUPRICOM: comportamiento de la página de inicio. Sin dependencias. */
(() => {
    "use strict";

    const D = window.SUPRICOM;
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
    const destacadoDe = (cat) => D.productos.find((p) => p.cat === cat && p.destacado) || D.productos.find((p) => p.cat === cat);

    // Enlaces a la tienda real de Odoo.
    for (const a of $$("[data-odoo]")) a.href = D.odoo + a.dataset.odoo;

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
        menuBoton.setAttribute("aria-expanded", String(abierto));
        menuBoton.setAttribute("aria-label", abierto ? "Cerrar menú" : "Abrir menú");
    });
    for (const a of $$("a", menu)) a.addEventListener("click", () => cerrarMenu(false));
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
    const etiquetaFrente = $(".orbita-frente");
    const enAnillo = D.categorias.map((c) => destacadoDe(c.id)).filter(Boolean);
    const paso = 360 / enAnillo.length;
    const items = enAnillo.map((p, i) => {
        const a = crear("a", { class: "orbita-item", href: ficha(p.id), draggable: false, "aria-label": `${p.marca} ${p.nombre}` }, [
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
            const p = enAnillo[mejor];
            etiquetaFrente.replaceChildren(document.createTextNode(p.nombre), crear("small", { text: `${p.marca} · ${p.codigo}` }));
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
    }, true);
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
    const banners = D.banners.map((b, i) => {
        const a = crear("a", { class: "banner", href: buscar(b.buscar), "aria-roledescription": "diapositiva", "aria-label": `${i + 1} de ${nB}: ${b.alt}` },
            [crear("img", { src: b.img, alt: "", draggable: false })]);
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
        if (QUIETO || enPausa()) return;
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
        const a = crear("a", { class: `marca-logo${m.oscura ? " oscura" : ""}`, href: buscar(m.nombre), title: m.nombre });
        a.append(crear("img", { src: `../website_supricom_tienda/static/src/img/marcas/${m.logo}`, alt: copia ? "" : m.nombre, style: `height:${m.alto}px` }));
        if (copia) { a.setAttribute("aria-hidden", "true"); a.tabIndex = -1; }
        return a;
    };
    // Las dos mitades de la cinta tienen que ser iguales y cubrir pantallas anchas.
    const unJuego = D.marcas.length * 186;
    const juegos = Math.max(1, Math.ceil(window.screen.width / unJuego));
    for (let k = 0; k < juegos * 2; k++) for (const m of D.marcas) pistaMarcas.append(tarjetaMarca(m, k > 0));
    pistaMarcas.style.setProperty("--duracion-cinta", `${44 * juegos}s`);

    /* ---------------------------------------------------------------- Categorías */
    const seccionCats = $(".categorias");
    const fijaCats = $(".categorias-fija");
    const pistaCats = $(".categorias-pista");
    for (const c of D.categorias) {
        pistaCats.append(crear("a", { class: "cat", href: buscar(c.buscar) }, [
            crear("h3", { text: c.nombre }),
            crear("img", { src: foto(c.foto), alt: "", loading: "lazy" }),
            crear("span", { class: "cat-ir", text: "Ver productos →" }),
        ]));
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

    // Inclinación 3D de las tarjetas de categoría siguiendo el mouse.
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
            const k = Math.min(1, Math.max(0, (y - seccionCats.offsetTop) / sobranteCats));
            pistaCats.style.transform = `translateX(${-k * sobranteCats}px)`;
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
    const areaCodigos = $("#codigos");
    const listaPedido = $(".pedido-lista");
    const resumen = $("#pedido-resumen");
    const enviar = $(".pedido-enviar");
    const porCodigo = new Map(D.productos.map((p) => [p.codigo.toUpperCase(), p]));
    // Acepta "COD 12", "COD;12", "COD,12", "COD x12", "COD ×12" y miles con punto ("COD 1.000").
    const leerLinea = (l) => {
        const m = l.match(/^([A-Za-z0-9][\w./-]*)[\s,;:\t]*(?:[x×*]\s*)?(\d{1,3}(?:\.\d{3})+|\d+)?\s*$/i);
        if (!m) return null;
        const cant = m[2] ? parseInt(m[2].replace(/\./g, ""), 10) : 1;
        return cant > 0 ? { codigo: m[1].toUpperCase(), cant } : null;
    };
    let yaMostrados = new Set();
    const leerPedido = () => {
        const pedido = new Map();
        for (const l of areaCodigos.value.split(/\n+/).map((s) => s.trim()).filter(Boolean)) {
            const r = leerLinea(l);
            if (r) pedido.set(r.codigo, (pedido.get(r.codigo) || 0) + r.cant);
        }
        const filas = [];
        const texto = ["Hola, quiero cotizar:"];
        let unidades = 0;
        let reconocidos = 0;
        for (const [codigo, cant] of pedido) {
            const p = porCodigo.get(codigo);
            unidades += cant;
            const viejo = yaMostrados.has(codigo) ? " sin-entrada" : "";
            if (p) {
                reconocidos += 1;
                texto.push(`${codigo} x ${cant} (${p.marca} ${p.nombre})`);
                filas.push(crear("div", { class: `linea-pedido${viejo}` }, [
                    crear("img", { src: foto(p.id), alt: "" }),
                    crear("div", {}, [crear("strong", { text: `${p.marca} ${p.nombre}` }), crear("small", { text: codigo })]),
                    crear("span", { class: "cantidad", text: `× ${miles(cant)}` }),
                ]));
            } else {
                texto.push(`${codigo} x ${cant}`);
                filas.push(crear("div", { class: `linea-pedido desconocido${viejo}` }, [
                    crear("div", {}, [crear("strong", { text: codigo }), crear("small", { text: "Código no reconocido aquí; tu vendedor lo revisa" })]),
                    crear("span", { class: "cantidad", text: `× ${miles(cant)}` }),
                ]));
            }
        }
        yaMostrados = new Set(pedido.keys());
        enviar.href = `https://wa.me/${D.whatsapp}?text=${encodeURIComponent(texto.join("\n"))}`;
        enviar.toggleAttribute("aria-disabled", !filas.length);
        if (!filas.length) {
            resumen.textContent = "";
            listaPedido.replaceChildren(crear("p", { class: "pedido-vacio", text: "Escribe un código por línea, por ejemplo: 5807C004AB 12" }));
            return;
        }
        resumen.textContent = `${reconocidos} de ${filas.length} códigos reconocidos · ${miles(unidades)} unidades`;
        listaPedido.replaceChildren(...filas);
    };
    let espera;
    areaCodigos.addEventListener("input", () => { clearTimeout(espera); espera = setTimeout(leerPedido, 200); });
    leerPedido();
})();
