/* SUPRICOM: página Tienda (catálogo de la sede). Usa lo que arma app.js: sede, tema, menú, cotización y el
   botón «Cotizar» de cada producto. Lo filtrado queda en el enlace (?cat=redes&marca=HP,Havit&q=router…)
   para poder compartirlo o volver con «Atrás». */
(() => {
    "use strict";
    const P = window.SUPRICOM_PAGINA;
    if (!P) return;
    const { S, D, FICHAS, QUIETO, nombreCategoria, foto, ficha, crear, icono, botonAgregar } = P;
    const $ = (s, el = document) => el.querySelector(s);
    const $$ = (s, el = document) => [...el.querySelectorAll(s)];
    const miles = (n) => n.toLocaleString("es-VE");
    const normal = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const mqEscritorio = window.matchMedia("(min-width: 961px)");
    const POR_PAGINA = 24;

    /* ---------------------------------------------------------------- Datos de la sede */
    const productos = D.productos;
    const orden0 = new Map(productos.map((p, i) => [p.id, i]));
    const rango = (lista) => new Map((S[lista] || []).map((id, i) => [id, i]));
    const LISTAS = [
        { id: "masVendidos", nombre: "Lo más pedido", chip: "Más pedido", clase: "", pos: rango("masVendidos") },
        { id: "novedades", nombre: "Novedades", chip: "Nuevo", clase: "nuevo", pos: rango("novedades") },
        { id: "menosRotan", nombre: "Oportunidades", chip: "Oportunidad", clase: "oportunidad", pos: rango("menosRotan") },
    ].filter((l) => l.pos.size);
    const listaPorId = Object.fromEntries(LISTAS.map((l) => [l.id, l]));
    const marcasDe = [...new Set(productos.map((p) => p.marca))];
    const indice = new Map(productos.map((p) => [p.id, normal(`${p.marca} ${p.nombre} ${p.codigo} ${nombreCategoria[p.cat] || ""}`)]));
    const chipDe = (p) => LISTAS.find((l) => l.pos.has(p.id));

    $("[data-sede-nombre]").textContent = S.nombre;
    $(".tienda-total").textContent = miles(productos.length);
    document.title = `Tienda ${S.nombre} · SUPRICOM`;

    /* ---------------------------------------------------------------- Estado (y el enlace) */
    const ORDENES = ["recomendados", "pedidos", "nuevos", "nombre", "marca"];
    const leerEnlace = () => {
        const u = new URLSearchParams(location.search);
        const marcas = (u.get("marca") || "").split(",").map((m) => marcasDe.find((x) => normal(x) === normal(m.trim()))).filter(Boolean);
        return {
            q: (u.get("q") || "").slice(0, 80),
            cat: D.categorias.some((c) => c.id === u.get("cat")) ? u.get("cat") : "",
            marcas: new Set(marcas),
            lista: listaPorId[u.get("lista")] ? u.get("lista") : "",
            orden: ORDENES.includes(u.get("orden")) ? u.get("orden") : "recomendados",
            vista: u.get("vista") === "lista" ? "lista" : "grilla",
            n: POR_PAGINA,
        };
    };
    let E = leerEnlace();
    // Lo que se escribe en el buscador no llena el historial: cada letra reemplaza la entrada; un filtro, una nueva.
    const escribirEnlace = (nueva) => {
        const u = new URL(location.href);
        const poner = (k, v) => (v ? u.searchParams.set(k, v) : u.searchParams.delete(k));
        poner("q", E.q.trim());
        poner("cat", E.cat);
        poner("marca", [...E.marcas].join(","));
        poner("lista", E.lista);
        poner("orden", E.orden === "recomendados" ? "" : E.orden);
        poner("vista", E.vista === "lista" ? "lista" : "");
        if (u.href === location.href) return;
        history[nueva ? "pushState" : "replaceState"](null, "", u.href);
    };

    /* ---------------------------------------------------------------- Filtrar y ordenar */
    // `sin`: el filtro que no se aplica, para contar cuántos quedarían al elegir otra opción de ese mismo filtro.
    const pasa = (p, sin = "") => {
        if (sin !== "cat" && E.cat && p.cat !== E.cat) return false;
        if (sin !== "marca" && E.marcas.size && !E.marcas.has(p.marca)) return false;
        if (sin !== "lista" && E.lista && !listaPorId[E.lista].pos.has(p.id)) return false;
        const q = normal(E.q.trim());
        if (q) {
            const t = indice.get(p.id);
            // Todas las palabras tienen que estar; un código se busca también sin guiones ni puntos.
            const sinSignos = t.replace(/[-./]/g, "");
            if (!q.split(/\s+/).every((w) => t.includes(w) || sinSignos.includes(w.replace(/[-./]/g, "")))) return false;
        }
        return true;
    };
    const puntaje = (p) => {
        const pedidos = listaPorId.masVendidos?.pos.get(p.id);
        const nuevo = listaPorId.novedades?.pos.get(p.id);
        switch (E.orden) {
            case "pedidos": return pedidos ?? 1000 + orden0.get(p.id);
            case "nuevos": return nuevo ?? 1000 + orden0.get(p.id);
            default: {
                // Recomendados: el destacado de cada categoría, lo más pedido, lo nuevo y después el resto.
                if (p.destacado) return orden0.get(p.id) / 1000;
                if (pedidos !== undefined) return 1 + pedidos;
                if (nuevo !== undefined) return 100 + nuevo;
                return 1000 + orden0.get(p.id);
            }
        }
    };
    const ordenar = (lista) => {
        if (E.orden === "nombre") return lista.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
        if (E.orden === "marca") return lista.sort((a, b) => a.marca.localeCompare(b.marca, "es") || a.nombre.localeCompare(b.nombre, "es"));
        return lista.sort((a, b) => puntaje(a) - puntaje(b));
    };
    const contar = (sin, prueba) => productos.filter((p) => pasa(p, sin) && prueba(p)).length;

    /* ---------------------------------------------------------------- Portada: abanico y categorías */
    // Tres productos de la sede en abanico, que siguen al mouse. Solo adorno.
    const abanico = $(".tienda-abanico");
    const paraAbanico = (S.masVendidos || []).map((id) => productos.find((p) => p.id === id)).filter(Boolean)
        .filter((p, i, a) => a.findIndex((x) => x.cat === p.cat) === i).slice(0, 3);
    paraAbanico.forEach((p, i) => {
        const tarjeta = crear("div", { class: "abanico-carta" }, [crear("img", { src: foto(p.id), alt: "", decoding: "async" })]);
        tarjeta.style.setProperty("--k", String(i - 1));
        abanico.append(tarjeta);
    });
    if (!QUIETO) {
        const cabeza = $(".tienda-cabeza");
        cabeza.addEventListener("pointermove", (ev) => {
            if (ev.pointerType !== "mouse") return;
            const r = abanico.getBoundingClientRect();
            abanico.style.setProperty("--mx", ((ev.clientX - r.left) / r.width - 0.5).toFixed(3));
            abanico.style.setProperty("--my", ((ev.clientY - r.top) / r.height - 0.5).toFixed(3));
        });
        cabeza.addEventListener("pointerleave", () => { abanico.style.setProperty("--mx", "0"); abanico.style.setProperty("--my", "0"); });
    }

    // Categorías: la fila de arriba (escritorio y celular) y la lista dentro de los filtros (celular).
    const filaCats = $(".tienda-cats");
    const opcionesCat = $('[data-filtro="cat"]');
    const botonesCat = [{ id: "", nombre: "Todo" }, ...D.categorias].map((c) => {
        const b = crear("button", { type: "button", class: "cat-pastilla", "data-cat": c.id }, [
            c.id ? crear("img", { src: foto(c.foto, 128), alt: "", loading: "lazy" }) : crear("span", { class: "cat-todo", "aria-hidden": "true" }),
            crear("span", { class: "cat-pastilla-nombre", text: c.nombre }),
            crear("span", { class: "cat-pastilla-n" }),
        ]);
        b.addEventListener("click", () => cambiar({ cat: c.id }, { aCatalogo: true }));
        filaCats.append(b);
        return b;
    });
    const radiosCat = [{ id: "", nombre: "Todas" }, ...D.categorias].map((c) => {
        const r = crear("input", { type: "radio", name: "f-cat", value: c.id });
        r.addEventListener("change", () => cambiar({ cat: c.id }));
        opcionesCat.append(crear("label", { class: "opcion" }, [r, crear("span", { text: c.nombre }), crear("span", { class: "opcion-n" })]));
        return r;
    });

    // En el celular el orden va dentro de la hoja de filtros (la barra solo tiene la búsqueda y «Filtros»).
    const opcionesOrden = $('[data-filtro="orden"]');
    const radiosOrden = [...$("#tienda-orden").options].map((o) => {
        const r = crear("input", { type: "radio", name: "f-orden", value: o.value });
        r.addEventListener("change", () => cambiar({ orden: o.value }));
        opcionesOrden.append(crear("label", { class: "opcion" }, [r, crear("span", { text: o.textContent })]));
        return r;
    });

    /* ---------------------------------------------------------------- Filtros: mostrar y marca */
    const opcionesLista = $('[data-filtro="lista"]');
    const radiosLista = [{ id: "", nombre: "Todo" }, ...LISTAS].map((l) => {
        const r = crear("input", { type: "radio", name: "f-lista", value: l.id });
        r.addEventListener("change", () => cambiar({ lista: l.id }));
        opcionesLista.append(crear("label", { class: "opcion" }, [r, crear("span", { text: l.nombre }), crear("span", { class: "opcion-n" })]));
        return r;
    });
    if (!LISTAS.length) opcionesLista.closest(".filtro").hidden = true;

    const opcionesMarca = $('[data-filtro="marca"]');
    const botonMasMarcas = $(".filtro-mas");
    const VISIBLES_MARCAS = 8;
    let todasLasMarcas = false;
    // Ordenadas por cuántos productos tienen en la sede.
    const marcasOrden = [...marcasDe].sort((a, b) => productos.filter((p) => p.marca === b).length - productos.filter((p) => p.marca === a).length || a.localeCompare(b, "es"));
    const casillasMarca = marcasOrden.map((m) => {
        const c = crear("input", { type: "checkbox", value: m });
        c.addEventListener("change", () => {
            const marcas = new Set(E.marcas);
            if (c.checked) marcas.add(m); else marcas.delete(m);
            cambiar({ marcas });
        });
        const etiqueta = crear("label", { class: "opcion" }, [c, crear("span", { text: m }), crear("span", { class: "opcion-n" })]);
        opcionesMarca.append(etiqueta);
        return c;
    });
    botonMasMarcas.addEventListener("click", () => {
        todasLasMarcas = !todasLasMarcas;
        pintarFiltros();
        if (todasLasMarcas) casillasMarca[VISIBLES_MARCAS]?.focus();
    });

    /* ---------------------------------------------------------------- Barra: búsqueda, orden y vista */
    const campo = $("#tienda-q");
    const borrar = $(".tienda-buscar-borrar");
    const selectorOrden = $("#tienda-orden");
    const botonesVista = $$(".tienda-vista button");
    let espera = 0;
    campo.addEventListener("input", () => {
        borrar.hidden = !campo.value;
        clearTimeout(espera);
        espera = setTimeout(() => cambiar({ q: campo.value }, { escribiendo: true }), 140);
    });
    campo.addEventListener("keydown", (ev) => {
        if (ev.key === "Escape" && campo.value) { ev.preventDefault(); campo.value = ""; borrar.hidden = true; cambiar({ q: "" }); }
        if (ev.key === "Enter") { ev.preventDefault(); clearTimeout(espera); cambiar({ q: campo.value }); }
    });
    borrar.addEventListener("click", () => { campo.value = ""; borrar.hidden = true; cambiar({ q: "" }); campo.focus(); });
    selectorOrden.addEventListener("change", () => cambiar({ orden: selectorOrden.value }));
    for (const b of botonesVista) b.addEventListener("click", () => cambiar({ vista: b.dataset.vista }, { mismaPagina: true }));

    /* ---------------------------------------------------------------- Tarjetas */
    const grilla = $(".tienda-grilla");
    const tarjeta = (p, i) => {
        const imagen = crear("img", { src: foto(p.id), alt: "", loading: i < 8 ? "eager" : "lazy", decoding: "async" });
        const marco = FICHAS
            ? crear("a", { class: "prod-foto", href: ficha(p.id), tabIndex: -1, "aria-hidden": "true" }, [imagen])
            : crear("div", { class: "prod-foto" }, [imagen]);
        const pie = [botonAgregar(p)];
        if (FICHAS) pie.unshift(crear("a", { class: "prod-ver", href: ficha(p.id), text: "Ver ficha", "aria-label": `Ver la ficha de ${p.marca} ${p.nombre}` }));
        const entrar = crear("a", { class: "prod-precio-entrar", href: `${D.odoo}/web/login`, text: "Entra para verlo" });
        const lista = chipDe(p);
        const hijos = [
            marco,
            crear("div", { class: "prod-texto" }, [
                crear("p", { class: "prod-marca", text: p.marca }),
                crear("h3", { class: "prod-nombre", text: p.nombre }),
                crear("p", { class: "prod-codigo", text: p.codigo }),
                crear("p", { class: "prod-cat", text: nombreCategoria[p.cat] || "" }),
            ]),
            crear("p", { class: "prod-precio" }, [crear("span", { text: "Precio" }), entrar]),
            crear("div", { class: "prod-pie" }, pie),
        ];
        if (lista) hijos.unshift(crear("span", { class: `prod-chip ${lista.clase}`, text: lista.chip }));
        const t = crear("article", { class: "prod prod-tienda", "aria-label": `${p.marca} ${p.nombre}` }, hijos);
        t.style.setProperty("--i", String(Math.min(i % POR_PAGINA, 11)));
        return t;
    };
    // Inclinación leve siguiendo el mouse (como las tarjetas de categoría del inicio).
    if (!QUIETO) {
        grilla.addEventListener("pointermove", (ev) => {
            if (ev.pointerType !== "mouse" || E.vista === "lista") return;
            const t = ev.target.closest(".prod-tienda");
            if (!t) return;
            const r = t.getBoundingClientRect();
            t.style.setProperty("--rx", `${(-((ev.clientY - r.top) / r.height - 0.5) * 6).toFixed(2)}deg`);
            t.style.setProperty("--ry", `${(((ev.clientX - r.left) / r.width - 0.5) * 7).toFixed(2)}deg`);
        });
        grilla.addEventListener("pointerout", (ev) => {
            const t = ev.target.closest(".prod-tienda");
            if (t && !t.contains(ev.relatedTarget)) { t.style.setProperty("--rx", "0deg"); t.style.setProperty("--ry", "0deg"); }
        });
    }

    /* ---------------------------------------------------------------- Pintar */
    const conteo = $("#tienda-conteo");
    const chips = $(".tienda-chips");
    const vacio = $(".tienda-vacio");
    const mas = $(".tienda-mas");
    const masTexto = $(".tienda-mas-texto");
    const masBarra = $(".tienda-mas-barra span");
    const botonMas = $(".tienda-mas-boton");
    const numeroFiltros = $(".filtros-n");
    const botonVerFiltros = $(".filtros-ver");
    let filtrados = [];
    let pintados = 0;

    const cuantosFiltros = () => (E.cat ? 1 : 0) + E.marcas.size + (E.lista ? 1 : 0);
    const pintarFiltros = () => {
        // Cada opción dice cuántos productos quedarían al elegirla, con los demás filtros como están.
        botonesCat.forEach((b) => {
            const id = b.dataset.cat;
            const n = contar("cat", (p) => !id || p.cat === id);
            b.setAttribute("aria-pressed", String(E.cat === id));
            $(".cat-pastilla-n", b).textContent = miles(n);
            b.classList.toggle("sin-productos", !n && E.cat !== id);
        });
        radiosCat.forEach((r) => {
            r.checked = E.cat === r.value;
            r.closest(".opcion").querySelector(".opcion-n").textContent = miles(contar("cat", (p) => !r.value || p.cat === r.value));
        });
        radiosOrden.forEach((r) => { r.checked = E.orden === r.value; });
        radiosLista.forEach((r) => {
            r.checked = E.lista === r.value;
            const n = contar("lista", (p) => !r.value || listaPorId[r.value].pos.has(p.id));
            r.closest(".opcion").querySelector(".opcion-n").textContent = miles(n);
        });
        casillasMarca.forEach((c, i) => {
            const n = contar("marca", (p) => p.marca === c.value);
            c.checked = E.marcas.has(c.value);
            const op = c.closest(".opcion");
            op.querySelector(".opcion-n").textContent = miles(n);
            op.classList.toggle("sin-productos", !n && !c.checked);
            op.hidden = !todasLasMarcas && i >= VISIBLES_MARCAS && !c.checked;
        });
        botonMasMarcas.hidden = casillasMarca.length <= VISIBLES_MARCAS;
        botonMasMarcas.textContent = todasLasMarcas ? "Ver menos marcas" : `Ver las ${casillasMarca.length} marcas`;
        botonMasMarcas.setAttribute("aria-expanded", String(todasLasMarcas));
        const f = cuantosFiltros();
        numeroFiltros.hidden = !f;
        numeroFiltros.textContent = String(f);
        $(".filtros-abrir").setAttribute("aria-label", f ? `Filtros: ${f} puestos` : "Filtros");
        $(".filtros-limpiar").disabled = !f && !E.q;
    };

    const quitarChip = (texto, quitar) => {
        const b = crear("button", { type: "button", class: "chip-filtro", "aria-label": `Quitar el filtro ${texto}` }, [crear("span", { text: texto }), icono("menos", "chip-x")]);
        $(".chip-x", b).innerHTML = '<path d="M6 6l12 12M18 6 6 18"/>';
        b.addEventListener("click", () => {
            const siguiente = b.nextElementSibling || b.previousElementSibling;
            quitar();
            (siguiente && siguiente.isConnected ? siguiente : campo).focus();
        });
        return b;
    };
    const pintarChips = () => {
        const lista = [];
        if (E.q.trim()) lista.push(quitarChip(`«${E.q.trim()}»`, () => { campo.value = ""; borrar.hidden = true; cambiar({ q: "" }); }));
        if (E.cat) lista.push(quitarChip(nombreCategoria[E.cat], () => cambiar({ cat: "" })));
        if (E.lista) lista.push(quitarChip(listaPorId[E.lista].nombre, () => cambiar({ lista: "" })));
        for (const m of E.marcas) lista.push(quitarChip(m, () => { const s = new Set(E.marcas); s.delete(m); cambiar({ marcas: s }); }));
        if (lista.length > 1) {
            const todo = crear("button", { type: "button", class: "enlace-chico", text: "Quitar todo" });
            todo.addEventListener("click", () => { limpiar(); campo.focus(); });
            lista.push(todo);
        }
        chips.replaceChildren(...lista);
    };

    const pintarMas = () => {
        const quedan = filtrados.length - pintados;
        mas.hidden = !filtrados.length;
        masTexto.textContent = `Viendo ${miles(pintados)} de ${miles(filtrados.length)}`;
        masBarra.style.transform = `scaleX(${filtrados.length ? pintados / filtrados.length : 0})`;
        botonMas.hidden = quedan <= 0;
        botonMas.textContent = `Ver ${miles(Math.min(quedan, POR_PAGINA))} más`;
    };

    const pintarProductos = () => {
        filtrados = ordenar(productos.filter((p) => pasa(p)));
        pintados = Math.min(E.n, filtrados.length);
        grilla.classList.toggle("lista", E.vista === "lista");
        grilla.replaceChildren(...filtrados.slice(0, pintados).map(tarjeta));
        vacio.hidden = filtrados.length > 0;
        if (!filtrados.length) {
            const q = E.q.trim();
            $(".tienda-vacio-titulo").textContent = q ? `No encontramos «${q}» en ${S.nombre}` : `Nada con esos filtros en ${S.nombre}`;
            $(".tienda-vacio-pedir").hidden = !q;
        }
        const n = filtrados.length;
        conteo.textContent = n === productos.length && !E.q.trim()
            ? `${miles(n)} productos`
            : `${miles(n)} ${n === 1 ? "producto" : "productos"} de ${miles(productos.length)}`;
        botonVerFiltros.textContent = n ? `Ver ${miles(n)} ${n === 1 ? "producto" : "productos"}` : "Sin productos";
        pintarMas();
        P.marcar();
    };

    const pintarTodo = () => {
        if (document.activeElement !== campo) { campo.value = E.q; borrar.hidden = !E.q; }
        selectorOrden.value = E.orden;
        for (const b of botonesVista) b.setAttribute("aria-pressed", String(b.dataset.vista === E.vista));
        pintarFiltros();
        pintarChips();
        pintarProductos();
    };

    // Cambia el estado y repinta. Al filtrar se vuelve a la primera página; si el catálogo quedó arriba de la
    // pantalla, se sube hasta él para ver los primeros resultados.
    const catalogo = $("#catalogo");
    const cambiar = (cambios, { escribiendo = false, mismaPagina = false, aCatalogo = false } = {}) => {
        E = { ...E, ...cambios, n: mismaPagina ? E.n : POR_PAGINA };
        escribirEnlace(!escribiendo);
        pintarTodo();
        const arriba = catalogo.getBoundingClientRect().top;
        if (!escribiendo && (arriba < 0 || (aCatalogo && arriba > window.innerHeight * 0.6)) && filtrosCerrados()) {
            catalogo.scrollIntoView({ behavior: QUIETO ? "auto" : "smooth", block: "start" });
        }
    };
    const limpiar = () => {
        campo.value = "";
        borrar.hidden = true;
        cambiar({ q: "", cat: "", marcas: new Set(), lista: "" });
    };

    botonMas.addEventListener("click", () => {
        const primeraNueva = pintados;
        E.n += POR_PAGINA;
        const nuevos = filtrados.slice(pintados, Math.min(E.n, filtrados.length));
        grilla.append(...nuevos.map((p, k) => tarjeta(p, primeraNueva + k)));
        pintados += nuevos.length;
        pintarMas();
        P.marcar();
        // El foco pasa al primer producto nuevo, para seguir con el teclado desde ahí.
        grilla.children[primeraNueva]?.querySelector(".agregar")?.focus({ preventScroll: true });
    });
    $(".tienda-vacio-limpiar").addEventListener("click", limpiar);
    $(".tienda-vacio-pedir").addEventListener("click", () => P.buscarEnCotizacion(E.q.trim()));

    /* ---------------------------------------------------------------- Filtros en el celular: una hoja que sube */
    const panel = $("#filtros");
    const botonFiltros = $(".filtros-abrir");
    let filtrosAbiertos = false;
    const filtrosCerrados = () => !filtrosAbiertos;
    const ponerModoPanel = () => {
        const hoja = !mqEscritorio.matches;
        panel.toggleAttribute("inert", hoja && !filtrosAbiertos);
        if (hoja) { panel.setAttribute("role", "dialog"); panel.setAttribute("aria-modal", "true"); }
        else { panel.removeAttribute("role"); panel.removeAttribute("aria-modal"); cerrarFiltros(false); }
    };
    const abrirFiltros = () => {
        filtrosAbiertos = true;
        panel.inert = false;
        document.body.classList.add("filtros-abiertos");
        document.documentElement.classList.add("carrito-abierto"); // bloquea el scroll, como la cotización
        botonFiltros.setAttribute("aria-expanded", "true");
        $(".filtros-cerrar").focus({ preventScroll: true });
    };
    const cerrarFiltros = (devolverFoco = true) => {
        if (!filtrosAbiertos) return;
        filtrosAbiertos = false;
        document.body.classList.remove("filtros-abiertos");
        document.documentElement.classList.remove("carrito-abierto");
        botonFiltros.setAttribute("aria-expanded", "false");
        if (!mqEscritorio.matches) panel.inert = true;
        if (devolverFoco) botonFiltros.focus({ preventScroll: true });
    };
    botonFiltros.setAttribute("aria-expanded", "false");
    botonFiltros.addEventListener("click", abrirFiltros);
    $(".filtros-cerrar").addEventListener("click", () => cerrarFiltros());
    $(".filtros-fondo").addEventListener("click", () => cerrarFiltros());
    botonVerFiltros.addEventListener("click", () => { cerrarFiltros(); catalogo.scrollIntoView({ behavior: "auto", block: "start" }); });
    $(".filtros-limpiar").addEventListener("click", limpiar);
    // «Pedir por código» abre la cotización: la hoja se cierra antes para no quedar debajo.
    $("[data-abrir-lista]", panel).addEventListener("click", () => cerrarFiltros(false), true);
    document.addEventListener("keydown", (ev) => {
        if (!filtrosAbiertos) return;
        if (ev.key === "Escape") { ev.preventDefault(); cerrarFiltros(); return; }
        if (ev.key !== "Tab") return;
        const enfocables = $$("button, input, a[href]", panel).filter((e) => !e.disabled && e.offsetParent !== null);
        const primero = enfocables[0];
        const ultimo = enfocables[enfocables.length - 1];
        if (ev.shiftKey && document.activeElement === primero) { ev.preventDefault(); ultimo.focus(); }
        else if (!ev.shiftKey && document.activeElement === ultimo) { ev.preventDefault(); primero.focus(); }
    });
    mqEscritorio.addEventListener("change", ponerModoPanel);
    ponerModoPanel();

    // «Atrás» y «Adelante» del navegador vuelven a los filtros de ese momento.
    window.addEventListener("popstate", () => { E = leerEnlace(); pintarTodo(); centrarCategoria(); });

    // La categoría elegida (por ejemplo, al llegar desde el inicio) se ve en la fila, aunque esté al final.
    const ventanaCats = $(".tienda-cats-ventana");
    const centrarCategoria = () => {
        const b = botonesCat.find((x) => x.dataset.cat === E.cat);
        if (!b || !E.cat) return;
        ventanaCats.scrollLeft = b.offsetLeft - (ventanaCats.clientWidth - b.offsetWidth) / 2;
    };

    pintarTodo();
    centrarCategoria();
})();
