/** @odoo-module **/

import publicWidget from "@web/legacy/js/public/public_widget";

const QUIETO = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Banners 3D: el banner activo al frente y los vecinos inclinados a los lados.
 * Pasa solo cada `data-intervalo` ms (5500 por defecto), se detiene con el mouse
 * encima y la escena se inclina un poco siguiendo el mouse. En el editor no corre
 * (disabledInEditableMode), así los banners quedan en fila para editarlos.
 */
publicWidget.registry.SupricomBanners3D = publicWidget.Widget.extend({
    selector: ".s_supricom_banners",
    disabledInEditableMode: true,
    events: {
        "mouseenter .s_supricom_banners_escena": "_onEnter",
        "mouseleave .s_supricom_banners_escena": "_onLeave",
        "mousemove .s_supricom_banners_escena": "_onMove",
        "click .s_supricom_banners_prev": "_onPrev",
        "click .s_supricom_banners_next": "_onNext",
        "click .s_supricom_banner": "_onClickBanner",
    },

    start() {
        this.escena = this.el.querySelector(".s_supricom_banners_escena");
        this.pista = this.el.querySelector(".s_supricom_banners_pista");
        this.banners = [...this.el.querySelectorAll(".s_supricom_banner")];
        this.puntos = this.el.querySelector(".s_supricom_banners_puntos");
        if (!this.escena || !this.pista || this.banners.length < 2) {
            return this._super(...arguments);
        }
        this.paso = 0;
        this.intervalo = parseInt(this.escena.dataset.intervalo, 10) || 5500;
        this.el.style.setProperty("--sup-intervalo", `${this.intervalo / 1000}s`);
        this._armarPuntos();
        this.el.classList.add("s_supricom_banners--3d");
        this._pintar();
        if (!QUIETO()) {
            this.timer = setInterval(() => {
                if (!this.pausado) {
                    this._ir(this.paso + 1);
                }
            }, this.intervalo);
        }
        return this._super(...arguments);
    },

    destroy() {
        clearInterval(this.timer);
        this.el.classList.remove("s_supricom_banners--3d", "is-pausado");
        this.el.style.removeProperty("--sup-intervalo");
        if (this.pista) {
            this.pista.style.transform = "";
        }
        for (const b of this.banners || []) {
            for (const p of ["transform", "opacity", "zIndex"]) {
                b.style[p] = "";
            }
            b.classList.remove("is-frente");
            b.removeAttribute("aria-hidden");
            b.removeAttribute("tabindex");
        }
        if (this.puntos) {
            this.puntos.replaceChildren();
        }
        this._super(...arguments);
    },

    _frente() {
        const n = this.banners.length;
        return ((this.paso % n) + n) % n;
    },

    /** Desplazamiento más corto de `i` respecto al banner del frente (−n/2 … n/2). */
    _desfase(i) {
        const n = this.banners.length;
        let o = (((i - this._frente()) % n) + n) % n;
        if (o > n / 2) {
            o -= n;
        }
        return o;
    },

    _armarPuntos() {
        if (!this.puntos) {
            return;
        }
        this.puntos.replaceChildren(
            ...this.banners.map((b, i) => {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.setAttribute("role", "tab");
                btn.textContent = b.dataset.nombre || `Banner ${i + 1}`;
                btn.addEventListener("click", () => this._ir(this.paso + this._desfase(i)));
                return btn;
            })
        );
    },

    _pintar() {
        const frente = this._frente();
        this.banners.forEach((b, i) => {
            const o = this._desfase(i);
            const a = Math.abs(o);
            b.style.transform = `translateX(-50%) translateX(${o * 58}%) translateZ(${-a * 260}px) rotateY(${-o * 34}deg)`;
            b.style.opacity = a === 0 ? "1" : a === 1 ? "0.55" : "0";
            b.style.zIndex = String(10 - a);
            b.classList.toggle("is-frente", a === 0);
            if (a === 0) {
                b.removeAttribute("aria-hidden");
                b.removeAttribute("tabindex");
            } else {
                b.setAttribute("aria-hidden", "true");
                b.setAttribute("tabindex", "-1");
            }
        });
        if (this.puntos) {
            [...this.puntos.children].forEach((btn, i) => {
                const on = i === frente;
                btn.setAttribute("aria-selected", on ? "true" : "false");
                btn.querySelector(".s_supricom_banners_avance")?.remove();
                if (on && !QUIETO()) {
                    const barra = document.createElement("span");
                    barra.className = "s_supricom_banners_avance";
                    barra.setAttribute("aria-hidden", "true");
                    btn.appendChild(barra);
                }
            });
        }
    },

    _ir(paso) {
        this.paso = paso;
        this._pintar();
    },

    /** Con menos de 2 banners start() no arma el 3D, pero los eventos ya quedaron enlazados. */
    _activo() {
        return this.el.classList.contains("s_supricom_banners--3d");
    },

    _onEnter() {
        if (!this._activo()) {
            return;
        }
        this.pausado = true;
        this.el.classList.add("is-pausado");
    },

    _onLeave() {
        if (!this._activo()) {
            return;
        }
        this.pausado = false;
        this.el.classList.remove("is-pausado");
        this.pista.style.transform = "";
    },

    _onMove(ev) {
        if (!this._activo() || QUIETO()) {
            return;
        }
        const r = this.escena.getBoundingClientRect();
        const x = (ev.clientX - r.left) / r.width - 0.5;
        const y = (ev.clientY - r.top) / r.height - 0.5;
        this.pista.style.transform = `rotateX(${-y * 8}deg) rotateY(${x * 10}deg)`;
    },

    _onPrev() {
        if (this._activo()) {
            this._ir(this.paso - 1);
        }
    },

    _onNext() {
        if (this._activo()) {
            this._ir(this.paso + 1);
        }
    },

    /** Un banner de un lado no abre su enlace: primero pasa al frente. */
    _onClickBanner(ev) {
        if (!this._activo()) {
            return;
        }
        const i = this.banners.indexOf(ev.currentTarget);
        const o = this._desfase(i);
        if (o !== 0) {
            ev.preventDefault();
            this._ir(this.paso + o);
        }
    },
});

/**
 * Cinta de marcas: duplica la lista (oculta a lectores de pantalla) para que el
 * bucle no tenga corte y enciende la animación. En el editor no corre.
 */
publicWidget.registry.SupricomMarcas = publicWidget.Widget.extend({
    selector: ".s_supricom_marcas",
    disabledInEditableMode: true,

    start() {
        const pista = this.el.querySelector(".s_supricom_marcas_pista");
        if (pista && !QUIETO()) {
            this.copias = [...pista.children].map((n) => {
                const c = n.cloneNode(true);
                c.setAttribute("aria-hidden", "true");
                c.setAttribute("tabindex", "-1");
                c.classList.add("s_supricom_marca_copia");
                pista.appendChild(c);
                return c;
            });
            this.el.classList.add("s_supricom_marcas--activa");
        }
        return this._super(...arguments);
    },

    destroy() {
        for (const c of this.copias || []) {
            c.remove();
        }
        this.el.classList.remove("s_supricom_marcas--activa");
        this._super(...arguments);
    },
});
