/* SUPRICOM: ficha de producto (producto.html?id=<product.template>). Usa lo que arma app.js (sede, tema, menú y
   cotización) y el contenido de Odoo de fichas.js. La sede decide qué productos hay: si el producto no está en
   la sede que se ve, se dice y se ofrece la sede que sí lo tiene. */
(() => {
    "use strict";
    const P = window.SUPRICOM_PAGINA;
    if (!P) return;
    const { S, D, QUIETO, nombreCategoria, foto, ficha, crear, botonAgregar, urlTienda, porId, MAX_CANT, LISTAS_SEDE } = P;
    const TODO = window.SUPRICOM;
    const CONTENIDO = window.SUPRICOM_FICHAS || {};
    const $ = (s, el = document) => el.querySelector(s);
    const miles = (n) => n.toLocaleString("es-VE");
    const unidades = (n) => `${miles(n)} ${n === 1 ? "unidad" : "unidades"}`;

    const id = Number(new URLSearchParams(location.search).get("id"));
    const p = porId.get(id);

    /* ---------------------------------------------------------------- No está en esta sede */
    if (!p) {
        for (const s of [".producto-portada", ".producto-detalle"]) $(s).hidden = true;
        $(".producto-nada").hidden = false;
        const otra = Object.entries(TODO.sedes).find(([, s]) => s !== S && s.productos.some((x) => x.id === id));
        const enOtra = otra && otra[1].productos.find((x) => x.id === id);
        $(".producto-nada-titulo").textContent = enOtra ? `${enOtra.marca} ${enOtra.nombre} no está en ${S.nombre}` : `Este producto no está en ${S.nombre}`;
        $(".producto-nada-texto").textContent = enOtra
            ? `Lo tiene la sede ${otra[1].nombre}. Si compras allá, ábrelo en esa sede; si no, pídelo por código en tu cotización y tu vendedor te dice cuándo llega.`
            : "Puede que se haya agotado o que el enlace esté incompleto. Búscalo en la tienda o pídelo por código en tu cotización.";
        if (enOtra) {
            const b = $(".producto-nada-otra");
            b.hidden = false;
            b.textContent = `Verlo en ${otra[1].nombre}`;
            b.href = `producto.html?id=${id}&sede=${otra[0]}`;
        }
        document.title = `Producto no disponible · SUPRICOM`;
        return;
    }

    /* ---------------------------------------------------------------- Cabeza de la ficha */
    const nombreCompleto = `${p.marca} ${p.nombre}`;
    document.title = `${nombreCompleto} · SUPRICOM`;
    const migaCat = $(".migas-cat");
    migaCat.textContent = nombreCategoria[p.cat] || "Categoría";
    migaCat.href = urlTienda({ cat: p.cat });
    $(".migas-nombre").textContent = p.nombre;

    const img = $(".producto-img");
    img.src = foto(p.id, 1024);
    img.alt = nombreCompleto;

    const posicion = (lista) => (LISTAS_SEDE[lista] || []).indexOf(p.id);
    const chip = $(".producto-chip");
    if (posicion("masVendidos") >= 0) { chip.textContent = `N.º ${posicion("masVendidos") + 1} de lo más pedido`; chip.hidden = false; }
    else if (posicion("novedades") >= 0) { chip.textContent = "Nuevo"; chip.classList.add("nuevo"); chip.hidden = false; }
    else if (posicion("menosRotan") >= 0) { chip.textContent = "Oportunidad"; chip.classList.add("oportunidad"); chip.hidden = false; }

    const marca = $(".producto-marca");
    marca.textContent = p.marca;
    marca.href = urlTienda({ marca: p.marca });
    marca.setAttribute("aria-label", `Ver todo ${p.marca} en la tienda`);
    $(".producto-nombre").textContent = p.nombre;
    $(".producto-codigo").textContent = p.codigo;
    $(".producto-disponible-texto").textContent = `Disponible en ${S.nombre}`;

    const contenido = CONTENIDO[p.id] || {};
    if (contenido.resumen) { $(".producto-resumen").textContent = contenido.resumen; $(".producto-resumen").hidden = false; }

    // Copiar el código: es lo que más se pega en una lista de pedido.
    const copiar = $(".producto-copiar");
    let relojCopia = 0;
    copiar.setAttribute("aria-label", `Copiar el código ${p.codigo}`);
    copiar.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(p.codigo); } catch (e) { return; }
        copiar.textContent = "Copiado";
        $(".producto-copiado").textContent = `Código ${p.codigo} copiado`;
        clearTimeout(relojCopia);
        relojCopia = setTimeout(() => { copiar.textContent = "Copiar"; $(".producto-copiado").textContent = ""; }, 2000);
    });

    /* ---------------------------------------------------------------- Foto: acercar con el mouse o con la lupa */
    const marco = $(".producto-foto");
    const lupa = $(".producto-lupa");
    const conMouse = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    $(".producto-foto-nota").textContent = conMouse ? "Foto de referencia. Pasa el mouse para acercarla." : "Foto de referencia. Toca la lupa para acercarla.";
    let lupaPuesta = false;
    const enfocar = (ev) => {
        const r = marco.getBoundingClientRect();
        marco.style.setProperty("--zx", `${(((ev.clientX - r.left) / r.width) * 100).toFixed(1)}%`);
        marco.style.setProperty("--zy", `${(((ev.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
    };
    const ponerLupa = (si) => {
        lupaPuesta = si;
        marco.classList.toggle("acercada", si);
        lupa.setAttribute("aria-pressed", String(si));
        lupa.setAttribute("aria-label", si ? "Alejar la foto" : "Acercar la foto");
        if (!si) { marco.style.removeProperty("--zx"); marco.style.removeProperty("--zy"); }
    };
    marco.addEventListener("pointermove", (ev) => {
        if (ev.pointerType === "mouse" && !lupaPuesta) marco.classList.add("acercada");
        if (ev.pointerType === "mouse" || lupaPuesta) enfocar(ev);
    });
    marco.addEventListener("pointerleave", (ev) => { if (ev.pointerType === "mouse" && !lupaPuesta) marco.classList.remove("acercada"); });
    lupa.addEventListener("click", (ev) => { ev.stopPropagation(); ponerLupa(!lupaPuesta); });
    document.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && lupaPuesta) ponerLupa(false); });

    /* ---------------------------------------------------------------- Cantidad y cotización */
    const campo = $(".producto-n");
    campo.max = String(MAX_CANT);
    const cantidad = () => Math.max(1, Math.min(MAX_CANT, parseInt(campo.value, 10) || 1));
    const ponerCantidad = (n) => {
        campo.value = String(Math.max(1, Math.min(MAX_CANT, n)));
        $(".producto-menos").setAttribute("aria-disabled", String(cantidad() <= 1));
        pintarBotones();
    };
    $(".producto-menos").addEventListener("click", () => ponerCantidad(cantidad() - 1));
    $(".producto-mas").addEventListener("click", () => ponerCantidad(cantidad() + 1));
    campo.addEventListener("change", () => ponerCantidad(cantidad()));
    campo.addEventListener("input", () => pintarBotones());
    campo.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); agregar(); } });

    const botonAgregarFicha = $(".producto-agregar");
    const botonBarra = $(".producto-barra-agregar");
    const pintarBotones = () => {
        const n = cantidad();
        $("span", botonAgregarFicha).textContent = n > 1 ? `Agregar ${miles(n)} a la cotización` : "Agregar a la cotización";
        botonAgregarFicha.setAttribute("aria-label", `Agregar ${unidades(n)} de ${nombreCompleto} a tu cotización`);
        $("span", botonBarra).textContent = n > 1 ? `Cotizar ${miles(n)}` : "Cotizar";
    };
    const agregar = () => {
        P.agregar(p, cantidad(), img);
        ponerCantidad(1);
    };
    botonAgregarFicha.addEventListener("click", agregar);
    botonBarra.addEventListener("click", agregar);
    $(".producto-ver-cotizacion").addEventListener("click", () => P.abrirCotizacion());

    const llevas = $(".producto-llevas");
    const pintarLlevas = () => {
        const n = P.enCotizacion(p.codigo);
        llevas.hidden = !n;
        $(".producto-llevas-texto").textContent = `Llevas ${unidades(n)} en tu cotización`;
    };

    /* ---------------------------------------------------------------- Detalles: características y especificaciones */
    // «Clave: valor» corto es una especificación; lo largo o sin clave, una característica.
    const filas = [
        ["Marca", p.marca],
        ["Código", p.codigo, "es-codigo"],
        ["Categoría", nombreCategoria[p.cat] || "—"],
        ["Disponible en", S.nombre],
    ];
    const rasgos = [];
    const mayuscula = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    for (const t of contenido.puntos || []) {
        const m = t.match(/^([^:]{2,32}):\s*(.+)$/);
        if (m && m[2].length <= 72) filas.push([m[1], mayuscula(m[2])]);
        else rasgos.push(m ? [m[1], mayuscula(m[2])] : [null, t]);
    }
    $(".especificaciones").replaceChildren(...filas.map(([k, v, clase]) => crear("div", clase ? { class: clase } : {}, [crear("dt", { text: k }), crear("dd", { text: v })])));
    if (rasgos.length) {
        $(".detalle-caracteristicas").hidden = false;
        $(".caracteristicas").replaceChildren(...rasgos.map(([titulo, texto]) => crear("li", {}, titulo
            ? [crear("strong", { text: titulo }), crear("span", { text: texto })]
            : [crear("span", { text: texto })])));
    }
    $(".detalle-falta").hidden = Boolean(contenido.puntos && contenido.puntos.length);

    /* ---------------------------------------------------------------- Se pide junto con / más de la categoría */
    const tarjeta = (q, i) => {
        const imagen = crear("img", { src: foto(q.id), alt: "", loading: "lazy", decoding: "async" });
        const t = crear("article", { class: "prod prod-ficha" }, [
            crear("a", { class: "prod-foto", href: ficha(q.id), tabIndex: -1, "aria-hidden": "true" }, [imagen]),
            crear("div", { class: "prod-texto" }, [
                crear("p", { class: "prod-marca", text: q.marca }),
                crear("h3", { class: "prod-nombre", text: q.nombre }),
                crear("p", { class: "prod-codigo", text: q.codigo }),
            ]),
            crear("div", { class: "prod-pie" }, [
                crear("a", { class: "prod-ver", href: ficha(q.id), text: "Ver ficha", "aria-label": `Ver la ficha de ${q.marca} ${q.nombre}` }),
                botonAgregar(q),
            ]),
        ]);
        t.style.setProperty("--i", String(i));
        return t;
    };
    const juntos = ((S.juntos || []).find((j) => j.id === p.id)?.con || []).map((x) => porId.get(x)).filter(Boolean);
    const seccionJuntos = $(".producto-juntos");
    const todoJuntos = $(".producto-juntos-todo");
    if (juntos.length) {
        seccionJuntos.hidden = false;
        $(".producto-juntos-pista").replaceChildren(...juntos.map(tarjeta));
        todoJuntos.addEventListener("click", () => {
            const faltan = juntos.filter((q) => !P.enCotizacion(q.codigo));
            (faltan.length ? faltan : juntos).forEach((q, k) => P.agregar(q, 1, k === 0 ? $(".producto-juntos-pista img") : null));
        });
    }
    const pintarJuntos = () => {
        if (!juntos.length) return;
        const todos = juntos.every((q) => P.enCotizacion(q.codigo));
        todoJuntos.classList.toggle("en-cotizacion", todos);
        $("span", todoJuntos).textContent = todos ? "Todos en tu cotización" : `Agregar los ${juntos.length}`;
        todoJuntos.setAttribute("aria-label", todos ? `Los ${juntos.length} productos que se piden junto con este ya están en tu cotización. Sumar uno más de cada uno` : `Agregar a tu cotización los ${juntos.length} productos que se piden junto con este`);
    };

    // Más de la misma categoría: primero lo más pedido de la sede, sin repetir lo de arriba.
    const rango = new Map((LISTAS_SEDE.masVendidos || []).map((x, i) => [x, i]));
    const deLaCategoria = D.productos.filter((q) => q.cat === p.cat && q.id !== p.id);
    const relacionados = deLaCategoria.filter((q) => !juntos.includes(q))
        .sort((a, b) => (rango.get(a.id) ?? 999) - (rango.get(b.id) ?? 999)).slice(0, 10);
    if (relacionados.length) {
        const cat = nombreCategoria[p.cat] || "esta categoría";
        $(".producto-relacionados").hidden = false;
        $(".producto-relacionados-titulo").textContent = `Más en ${cat}`;
        $(".producto-relacionados-nota").textContent = `${miles(deLaCategoria.length + 1)} productos de esta categoría en ${S.nombre}.`;
        const ir = $(".producto-relacionados-ir");
        ir.href = urlTienda({ cat: p.cat });
        ir.firstChild.textContent = "Ver todos en la tienda";
        $(".producto-relacionados-pista").replaceChildren(...relacionados.map(tarjeta));
    }

    /* ---------------------------------------------------------------- Barra de abajo en el teléfono */
    const barra = $(".producto-barra");
    $(".producto-barra-foto").src = foto(p.id, 128);
    $(".producto-barra-nombre").textContent = nombreCompleto;
    const mostrarBarra = (si) => {
        barra.classList.toggle("visible", si);
        barra.inert = !si;
        barra.setAttribute("aria-hidden", String(!si));
    };
    // Aparece cuando el botón principal quedó arriba (no antes de llegar a él).
    new IntersectionObserver(([e]) => mostrarBarra(!e.isIntersecting && e.boundingClientRect.top < 0))
        .observe($(".producto-comprar"));

    /* ---------------------------------------------------------------- Inclinación leve de la foto */
    if (!QUIETO) {
        const galeria = $(".producto-galeria");
        galeria.addEventListener("pointermove", (ev) => {
            if (ev.pointerType !== "mouse") return;
            const r = galeria.getBoundingClientRect();
            galeria.style.setProperty("--rx", `${(-((ev.clientY - r.top) / r.height - 0.5) * 4).toFixed(2)}deg`);
            galeria.style.setProperty("--ry", `${(((ev.clientX - r.left) / r.width - 0.5) * 5).toFixed(2)}deg`);
        });
        galeria.addEventListener("pointerleave", () => { galeria.style.setProperty("--rx", "0deg"); galeria.style.setProperty("--ry", "0deg"); });
    }

    P.alCambiarCotizacion(() => { pintarLlevas(); pintarJuntos(); });
    ponerCantidad(1);
    pintarLlevas();
    pintarJuntos();
    P.marcar();
})();
