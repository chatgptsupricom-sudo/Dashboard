/* SUPRICOM: «Solicitar cuenta» (cuenta.html). Reemplaza al Formulario de Google de Odoo: manda la
   solicitud a la API del panel (POST /api/tienda-web/cuenta), que la guarda y le avisa por correo a ventas
   de la sede elegida. Las listas (estados, provincias, tipos de negocio) son las de
   lib/tienda-web/cuentaTipos.ts: si cambian allá, cambiarlas aquí. */
(() => {
    "use strict";
    const P = window.SUPRICOM_PAGINA;
    if (!P) return;
    const T = window.SUPRICOM;
    const $ = (s, el = document) => el.querySelector(s);
    const $$ = (s, el = document) => [...el.querySelectorAll(s)];
    const crear = P.crear;

    const ESTADOS_VENEZUELA = [
        "Amazonas", "Anzoátegui", "Apure", "Aragua", "Barinas", "Bolívar", "Carabobo", "Caracas (Distrito Capital)",
        "Cojedes", "Delta Amacuro", "Falcón", "Guárico", "La Guaira", "Lara", "Mérida", "Miranda", "Monagas",
        "Nueva Esparta", "Portuguesa", "Sucre", "Táchira", "Trujillo", "Yaracuy", "Zulia",
    ];
    const PROVINCIAS_PANAMA = [
        "Bocas del Toro", "Chiriquí", "Coclé", "Colón", "Darién", "Herrera", "Los Santos", "Panamá", "Panamá Oeste",
        "Veraguas", "Comarca Emberá-Wounaan", "Comarca Guna Yala", "Comarca Naso Tjër Di", "Comarca Ngäbe-Buglé",
    ];
    const TIPOS_NEGOCIO = [
        "Tienda de computación y tecnología", "Papelería y librería", "Distribuidor / mayorista", "Celulares y electrónica",
        "Empresa (compra para uso propio)", "Instalador / integrador", "Gobierno o institución", "Otro",
    ];

    const pedida = new URLSearchParams(location.search).get("api");
    const api = (pedida === "no" ? "" : pedida || T.api || "").replace(/\/+$/, "");
    const form = $(".cuenta-form");
    const inicio = Date.now();
    const CLAVE_BORRADOR = "supricom-cuenta-borrador";

    // En esta página «Solicitar cuenta» de la cabecera es la página actual.
    for (const a of $$('a[data-ir="cuenta.html"]')) a.setAttribute("aria-current", "page");

    /* ---------------------------------------------------------------- Sede: a quién le llega y qué se pide */
    let sede = P.sede.id;
    const grupoSede = $('[data-grupo="sede"]');
    for (const [id, s] of Object.entries(T.sedes)) {
        const r = crear("input", { type: "radio", name: "sede", value: id });
        r.checked = id === sede;
        r.addEventListener("change", () => ponerSede(id));
        grupoSede.append(crear("label", {}, [r, crear("span", { text: s.nombre })]));
    }
    const selectorEstado = $("#c-estado");
    const ponerSede = (id) => {
        sede = id;
        const S = T.sedes[id];
        const panama = id === "panama";
        const doc = S.documento || (panama ? "RUC" : "RIF");
        $("[data-cuenta-doc-etiqueta]").textContent = doc;
        for (const el of $$("[data-cuenta-doc]")) el.textContent = doc;
        $("#ayuda-documento").textContent = panama ? "Por ejemplo, 155612345-2-2021" : "Con su letra, por ejemplo J-12345678-9";
        $("#c-telefono").placeholder = panama ? "6123-4567" : "0412 555 5555";
        $("[data-cuenta-estado-etiqueta]").textContent = panama ? "Provincia" : "Estado";
        const elegido = selectorEstado.value;
        const lista = panama ? PROVINCIAS_PANAMA : ESTADOS_VENEZUELA;
        selectorEstado.replaceChildren(
            crear("option", { value: "", text: panama ? "Elige la provincia" : "Elige el estado" }),
            ...lista.map((e) => crear("option", { value: e, text: e })),
        );
        selectorEstado.value = lista.includes(elegido) ? elegido : "";
        $(".cuenta-destino").textContent = `Tu solicitud le llega al equipo de ventas de ${S.nombre}.`;
        limpiarError("documento");
        limpiarError("estado");
    };
    $("#c-tipo").replaceChildren(crear("option", { value: "", text: "Elige uno" }), ...TIPOS_NEGOCIO.map((t) => crear("option", { value: t, text: t })));

    /* ---------------------------------------------------------------- Errores por campo */
    const campoDe = (nombre) => form.elements[nombre];
    const mostrarError = (nombre, texto) => {
        const p = $(`#error-${nombre}`);
        if (!p) return;
        p.textContent = texto;
        p.hidden = false;
        const c = campoDe(nombre);
        const controles = c instanceof RadioNodeList ? [...c] : [c];
        for (const x of controles) {
            x.setAttribute("aria-invalid", "true");
            const desc = (x.getAttribute("aria-describedby") || "").split(" ").filter(Boolean);
            if (!desc.includes(p.id)) x.setAttribute("aria-describedby", [...desc, p.id].join(" "));
        }
    };
    function limpiarError(nombre) {
        const p = $(`#error-${nombre}`);
        if (!p || p.hidden) return;
        p.hidden = true;
        const c = campoDe(nombre);
        for (const x of c instanceof RadioNodeList ? [...c] : [c]) x.removeAttribute("aria-invalid");
    }
    form.addEventListener("input", (ev) => { if (ev.target.name) limpiarError(ev.target.name); guardarBorrador(); });
    form.addEventListener("change", (ev) => { if (ev.target.name) limpiarError(ev.target.name); guardarBorrador(); });

    // Lo mismo que revisa el panel (validarSolicitud), para avisar antes de enviar.
    const CORREO = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[a-z]{2,}$/i;
    const revisar = (d) => {
        const errores = [];
        if (!d.compraMayor) errores.push(["compraMayor", "Dinos si compras al mayor para una tienda o empresa"]);
        if (d.nombre.length < 2) errores.push(["nombre", "Escribe tu nombre"]);
        if (d.apellido.length < 2) errores.push(["apellido", "Escribe tu apellido"]);
        if (d.empresa.length < 2) errores.push(["empresa", "Escribe el nombre de la empresa"]);
        const docLimpio = d.documento.toUpperCase().replace(/[\s.-]/g, "");
        if (sede === "panama") {
            if (!/^[0-9A-Z][0-9A-Z-]{4,24}$/.test(d.documento.toUpperCase().replace(/\s+/g, "")) || !/\d{3}/.test(d.documento)) errores.push(["documento", "Escribe el RUC de la empresa"]);
        } else if (!/^[VEJGPC]\d{6,9}$/.test(docLimpio)) errores.push(["documento", "Escribe el RIF con su letra (por ejemplo, J-12345678-9)"]);
        const digitos = d.telefono.replace(/\D/g, "");
        if (!/^[+\d\s().-]+$/.test(d.telefono) || digitos.length < 7 || digitos.length > 15) errores.push(["telefono", "Escribe un teléfono válido"]);
        if (!CORREO.test(d.correo)) errores.push(["correo", "Escribe un correo válido"]);
        if (!d.estado) errores.push(["estado", sede === "panama" ? "Elige la provincia" : "Elige el estado"]);
        if (d.direccion.length < 5) errores.push(["direccion", "Escribe la dirección de la empresa"]);
        return errores;
    };
    const leer = () => {
        const f = new FormData(form);
        const t = (k) => String(f.get(k) || "").trim();
        return {
            sede, compraMayor: t("compraMayor"), nombre: t("nombre"), apellido: t("apellido"), empresa: t("empresa"),
            documento: t("documento"), telefono: t("telefono"), correo: t("correo"), estado: t("estado"),
            tipoNegocio: t("tipoNegocio"), direccion: t("direccion"), comentario: t("comentario"), sitioWeb: t("sitioWeb"),
        };
    };

    /* ---------------------------------------------------------------- Borrador (solo en esta pestaña) */
    function guardarBorrador() {
        const { sitioWeb, ...d } = leer();
        try { sessionStorage.setItem(CLAVE_BORRADOR, JSON.stringify(d)); } catch (e) { /* sin almacenamiento */ }
    }
    try {
        const b = JSON.parse(sessionStorage.getItem(CLAVE_BORRADOR) || "null");
        if (b && T.sedes[b.sede]) {
            sede = b.sede;
            for (const r of $$('input[name="sede"]')) r.checked = r.value === sede;
        }
        ponerSede(sede);
        if (b) {
            for (const [k, v] of Object.entries(b)) {
                const c = campoDe(k);
                if (!c || k === "sede" || !v) continue;
                if (c instanceof RadioNodeList) { for (const r of c) r.checked = r.value === v; } else c.value = v;
            }
        }
    } catch (e) { ponerSede(sede); }

    /* ---------------------------------------------------------------- Captcha (si está configurado) */
    const captcha = $(".cuenta-captcha");
    let idCaptcha = null;
    if (T.turnstile) {
        captcha.hidden = false;
        window.alCargarTurnstile = () => { idCaptcha = window.turnstile.render(captcha, { sitekey: T.turnstile, language: "es" }); };
        const s = document.createElement("script");
        s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=alCargarTurnstile&render=explicit";
        s.async = true;
        document.head.append(s);
    }

    /* ---------------------------------------------------------------- Enviar */
    const boton = $(".cuenta-boton");
    const fallo = $(".cuenta-fallo");
    // Si el panel no responde, se puede mandar igual por WhatsApp o correo a la sede, con los datos escritos.
    const alternativa = (d) => {
        const S = T.sedes[sede];
        const texto = [
            `Hola, quiero solicitar una cuenta de distribuidor en la sede ${S.nombre}.`, "",
            `Empresa: ${d.empresa}`, `${S.documento || "RIF"}: ${d.documento}`, `Contacto: ${d.nombre} ${d.apellido}`,
            `Teléfono: ${d.telefono}`, `Correo: ${d.correo}`, `Estado/provincia: ${d.estado}`, `Dirección: ${d.direccion}`,
            ...(d.tipoNegocio ? [`Tipo de negocio: ${d.tipoNegocio}`] : []), ...(d.comentario ? ["", d.comentario] : []),
        ].join("\n");
        return S.whatsapp
            ? { href: `https://wa.me/${S.whatsapp}?text=${encodeURIComponent(texto)}`, texto: "mándala por WhatsApp" }
            : { href: `mailto:${S.correo}?subject=${encodeURIComponent(`Solicitud de cuenta · ${d.empresa}`)}&body=${encodeURIComponent(texto)}`, texto: "mándala por correo" };
    };
    const mostrarFallo = (texto, d) => {
        const alt = d ? alternativa(d) : null;
        fallo.replaceChildren(texto, ...(alt ? [" Si prefieres, ", crear("a", { href: alt.href, text: alt.texto, target: "_blank", rel: "noopener" }), "."] : []));
        fallo.hidden = false;
    };
    const ocupado = (si) => {
        boton.disabled = si;
        boton.classList.toggle("enviando", si);
        $(".cuenta-boton-texto", boton).textContent = si ? "Enviando…" : "Enviar solicitud";
    };
    const listo = (d) => {
        try { sessionStorage.removeItem(CLAVE_BORRADOR); } catch (e) { /* sin almacenamiento */ }
        form.hidden = true;
        const panel = $(".cuenta-listo");
        $(".cuenta-listo-texto", panel).textContent =
            `El equipo de ventas de ${T.sedes[sede].nombre} revisa los datos de ${d.empresa} y te escribe a ${d.correo} o al ${d.telefono} para activar tu cuenta.`;
        panel.hidden = false;
        panel.focus({ preventScroll: true });
        panel.scrollIntoView({ behavior: P.QUIETO ? "auto" : "smooth", block: "center" });
    };

    form.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        fallo.hidden = true;
        const d = leer();
        const errores = revisar(d);
        for (const [k, t] of errores) mostrarError(k, t);
        if (errores.length) {
            const primero = campoDe(errores[0][0]);
            (primero instanceof RadioNodeList ? primero[0] : primero).focus();
            return;
        }
        if (!api) { mostrarFallo("No pudimos enviar tu solicitud desde aquí.", d); return; }
        ocupado(true);
        try {
            const r = await fetch(`${api}/cuenta`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "omit",
                body: JSON.stringify({
                    ...d, llenadoMs: Date.now() - inicio, pagina: location.href,
                    captcha: idCaptcha !== null && window.turnstile ? window.turnstile.getResponse(idCaptcha) : undefined,
                }),
            });
            const j = await r.json().catch(() => ({}));
            if (r.ok && j.ok) { listo(d); return; }
            if (r.status === 400 && j.campo && $(`#error-${j.campo}`)) { mostrarError(j.campo, j.error); campoDe(j.campo).focus?.(); return; }
            if (r.status === 429) { mostrarFallo("Hiciste varios intentos seguidos. Espera unos minutos y vuelve a enviarla.", d); return; }
            mostrarFallo(j.error || "No pudimos enviar tu solicitud.", d);
        } catch (e) {
            mostrarFallo("No pudimos conectar para enviar tu solicitud.", d);
        } finally {
            ocupado(false);
            if (idCaptcha !== null && window.turnstile) window.turnstile.reset(idCaptcha);
        }
    });
})();
