/* SUPRICOM: catálogo en vivo. Antes de arrancar la página pide a la API del panel (app/api/tienda-web) los
   productos publicados en la web con su existencia en la sede y reemplaza la copia de datos.js. Si la API
   no responde en 5 s, o no está configurada, sigue con la copia: la página nunca se queda en blanco.
   Después carga, en orden, los scripts de `data-despues` (app.js y el de la página).

   Lo que ya está curado en datos.js (nombre corto, categoría, destacado) se respeta para esos productos;
   el resto toma el nombre legible que arma el panel. Se guarda 10 min en la pestaña para no volver a
   pedirlo en cada página. */
(() => {
    "use strict";
    const T = window.SUPRICOM;
    const yo = document.currentScript;
    const despues = (yo.dataset.despues || "").split(",").map((s) => s.trim()).filter(Boolean);
    const seguir = () => {
        for (const src of despues) {
            const s = document.createElement("script");
            s.src = src;
            s.async = false; // en orden: app.js antes que el de la página
            document.body.append(s);
        }
    };

    const sede = T.elegirSede().id;
    const pedida = new URLSearchParams(location.search).get("api");
    const api = (pedida === "no" ? "" : pedida || T.api || "").replace(/\/+$/, "");
    T.enVivo = null;
    T.apiActiva = "";
    if (!api) { seguir(); return; }

    const aplicar = (datos) => {
        const S = T.sedes[sede];
        if (!S || !Array.isArray(datos.productos) || !datos.productos.length) return false;
        const curados = new Map(S.productos.map((p) => [p.id, p]));
        const categorias = new Set(T.categorias.map((c) => c.id));
        S.productos = datos.productos
            .filter((x) => x && x.id && x.c)
            .map((x) => {
                const c = curados.get(x.id);
                return {
                    id: x.id,
                    codigo: x.c,
                    marca: (c && c.marca) || x.m || "",
                    nombre: (c && c.nombre) || x.n || x.c,
                    cat: (c && c.cat) || (categorias.has(x.k) ? x.k : "otros"),
                    destacado: Boolean(c && c.destacado),
                    disponible: x.d === 1,
                };
            });
        T.enVivo = { actualizado: datos.actualizado || null, total: S.productos.length };
        T.apiActiva = api;
        return true;
    };

    const CLAVE = `supricom-catalogo-${sede}|${api}`;
    try {
        const guardado = JSON.parse(sessionStorage.getItem(CLAVE) || "null");
        if (guardado && Date.now() - guardado.t < 10 * 60 * 1000 && aplicar(guardado.datos)) { seguir(); return; }
    } catch (e) { /* sin almacenamiento o dañado: se pide de nuevo */ }

    const corte = new AbortController();
    const reloj = setTimeout(() => corte.abort(), 5000);
    fetch(`${api}/catalogo?sede=${encodeURIComponent(sede)}`, { signal: corte.signal, credentials: "omit" })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((datos) => {
            if (aplicar(datos)) {
                try { sessionStorage.setItem(CLAVE, JSON.stringify({ t: Date.now(), datos })); } catch (e) { /* lleno: no importa */ }
            }
        })
        .catch((e) => { console.warn("[tienda] catálogo en vivo no disponible, sigo con la copia:", e.message || e); })
        .finally(() => { clearTimeout(reloj); seguir(); });
})();
