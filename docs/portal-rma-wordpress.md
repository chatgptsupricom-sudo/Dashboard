# Portal RMA en supricom.com.ve — Guía para WordPress

Issue #26: poner el botón de **Servicio Técnico** en el sitio institucional de Supricom
(WordPress + tema Woodmart) para que el cliente final llegue al portal público
sin tener que llamar.

Este issue es **fuera de este repo**: el sitio es WordPress y necesita quien tenga
acceso al panel de WordPress para publicar el cambio. Lo que este repo sí tiene
listo son los snippets HTML/CSS con el estilo Supricom para pegar.

## TL;DR

- **URL pública del portal: `https://panel.supricom.com.ve/es/servicio-tecnico`**
- **NO publicar este enlace hasta que el issue de seguridad (#25) esté cerrado**
- Tres snippets listos para copiar y pegar (topbar / menú / botón principal)
  en `public/wordpress-snippets/` de este proyecto
- Texto: **"Servicio Técnico"** (no "RMA", es jerga interna)

## 1. Dominio

**Decisión tomada: `panel.supricom.com.ve`.** El portal se publica bajo el
subdominio `panel.supricom.com.ve` (apuntando al host del panel). NO se usa un
subdominio dedicado tipo `servicio.supricom.com.ve` — el cliente entra por
`panel.supricom.com.ve` que es donde vive todo el panel.

Esto requiere:
- **DNS**: registro CNAME (o A) apuntando `panel.supricom.com.ve` al host del deploy del portal
- **Certificado TLS**: Let's Encrypt o el proveedor que use Supricom
- **Coordinación con quien maneje infraestructura** — confirmar que el host del
  panel responde también por ese hostname

## 2. Dónde poner el enlace

El sitio tiene tres lugares naturales. **Recomendación: ponerlo en los tres.**

### Barra superior (topbar)

El sitio tiene un strip arriba con texto plano:
> "Somos tu mayorista de confianza · Solicitud para crear cuenta · Teléfono:..."

Ahí ya vive "Solicitud para crear cuenta", que es exactamente el mismo tipo de
enlace. **Agregar "Servicio Técnico" al lado**, en el mismo estilo visual.

- Snippet: `public/wordpress-snippets/servicio-tecnico-topbar.html`
- Cómo pegarlo: editar el bloque HTML de la topbar en Woodmart (Child Theme,
  campo de "Header HTML" o el widget que esté usando el sitio)

### Menú principal

> PÁGINA PRINCIPAL · QUIENES SOMOS · PRODUCTOS · CONTÁCTENOS

**Agregar "Servicio Técnico" como ítem del menú principal**, antes o después de
CONTÁCTENOS. Si el tema no admite un ítem más, agregarlo dentro del dropdown
de CONTÁCTENOS.

- Snippet: `public/wordpress-snippets/servicio-tecnico-menu.html`
- Cómo pegarlo: Apariencia → Menús → agregar ítem personalizado con la URL del
  portal

### Botón flotante / destacado (opcional)

Si quieren un acceso más visible, sobre todo para clientes que ya están en la
home buscando ayuda: un botón del estilo de los CTAs principales de Supricom,
centrado o en una sección "Ayuda".

- Snippet: `public/wordpress-snippets/servicio-tecnico-button.html`
- Cómo pegarlo: en una sección de la home o como shortcode en el editor

### Footer (opcional)

Si el footer es editable, agregar el enlace al pie con un texto corto.

## 4. Estilo visual

Los snippets ya vienen con:

- **Color primario:** `#741DFE` (morado de Supricom)
- **Tipografía:** Manrope 600 (la del sitio)
- **Border radius:** `10px`
- **Color hover:** oscurecimiento del morado a `#5e17c9`

No hay que tocar nada — solo pegar.

## 5. Selector de sucursal y de idioma

### Selector de sucursal

El sitio tiene selector de sucursal (Valencia, Caracas, Panamá, USA).
**Decidir si el portal atiende las 4** o solo a Venezuela, y según eso:

- Si atiende solo a Venezuela, **no mostrar el botón en la versión USA** del
  sitio (o agregarlo condicionalmente con un shortcode que vea la sucursal
  seleccionada)
- Si atiende las 4, no hay problema — el botón va siempre

### Selector de idioma

El sitio tiene selector ES/EN. **Si el portal está en ambos idiomas** (ya
está — `app/[locale]/servicio-tecnico` tiene locale routing), el botón debe
llevar al idioma activo del sitio:

```html
<!-- Reemplazar /es/ por el idioma activo del sitio -->
<a href="https://panel.supricom.com.ve/es/servicio-tecnico">
```

En WordPress con WPML o Polylang, se usa la función del plugin
(`ICL_LANGUAGE_CODE` o similar) para construir la URL dinámicamente.

## 6. Apertura en nueva pestaña

- Como el portal va en `panel.supricom.com.ve` (subdominio de Supricom): abrir
  en **la misma pestaña** — no se está abandonando el sitio, solo yendo a
  otro rincón de Supricom
- Si va en la **URL actual del panel** (no recomendado): en **nueva pestaña**
  — la URL se ve "ajena"

Los snippets tienen el target ya seteado a `_self` (misma pestaña). Si
eventualmente se publica en la URL del panel, cambiar a `target="_blank"`.

## 7. Mobile

Woodmart en móvil muestra un menú hamburguesa separado del escritorio.
**Probar el flujo entero en mobile** después de publicar:

- Que el botón aparezca en el menú hamburguesa (no solo en el topbar)
- Que el tap abra el portal sin trampas
- Que el modal de selección de sucursal en mobile (si existe) no rompa el flujo

## 8. Coordinación con el issue de seguridad

**No publicar este enlace hasta que el issue #25 (Hardening de endpoints
públicos) esté cerrado.** El día que el botón esté visible, los endpoints del
portal quedan expuestos a internet; primero el blindaje, después la puerta.

El issue #25 cubre:
- Rate limiting por IP
- Validación de entrada (zod)
- Endurecer respuestas (no exponer mensajes de error internos)
- Captcha (opcional pero recomendado)
- Logging

## 9. Cómo probar después de publicar

Antes de darlo por hecho:

1. **Desktop**: entrar a supricom.com.ve desde incógnito, ver el botón, click,
   que cargue el portal sin login
2. **Mobile**: lo mismo en el teléfono
3. **Idioma**: cambiar el sitio a EN, verificar que el botón lleva a `/en/...`
4. **Caché**: si WordPress tiene caché de página, purgar después de pegar
5. **Lighthouse**: revisar que el nuevo HTML no rompa el perf score del sitio

## 10. Snippets disponibles

| Archivo | Uso |
|---|---|
| `public/wordpress-snippets/servicio-tecnico-button.html` | Botón destacado (sección de la home o CTA) |
| `public/wordpress-snippets/servicio-tecnico-topbar.html` | Para agregar al strip de arriba |
| `public/wordpress-snippets/servicio-tecnico-menu.html` | Ítem para el menú principal |

Todos los snippets apuntan a **`https://panel.supricom.com.ve/es/servicio-tecnico`**.
Listos para pegar tal cual, sin reemplazos pendientes.

## 11. Criterio de aceptación

- El enlace está visible en supricom.com.ve, en escritorio y en móvil
- Lleva al portal y el portal carga sin sesión
- Se ve integrado al diseño del sitio, no pegado encima
- El issue #25 (seguridad) está cerrado **antes** de publicar
- Funciona en ES y EN
- En mobile el botón aparece en el menú hamburguesa

## 12. Si hay dudas

- El portal es este repo: `app/[locale]/servicio-tecnico/page.tsx` (landing)
  y `app/[locale]/servicio-tecnico/consultar/page.tsx` (consulta de estatus)
- Los issues relacionados: #19 (consulta de factura), #22 (persistencia),
  #23 (consulta de estatus), #25 (seguridad), #28 (motor de garantía)
- Contacto en el repo: abrir issue con la etiqueta `portal-rma`