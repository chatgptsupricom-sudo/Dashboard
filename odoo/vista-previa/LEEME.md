# Vista previa del módulo

Las páginas reales de supricom2.odoo.com (inicio, tienda y una ficha, guardadas el 3-nov-2026) con el módulo `website_supricom_tienda` aplicado encima: su CSS compilado (`tienda.css`), su JS (`vista-previa.js`, con un reemplazo mínimo de lo que en Odoo hace publicWidget) y, en el inicio, sus tres bloques en lugar de las secciones de antes.

Para verla hay que servir la carpeta `odoo/` (abrir los .html con doble clic no carga el CSS ni las imágenes):

    python -m http.server 8765 --directory odoo

y abrir http://localhost:8765/vista-previa/ (la portada enlaza las tres páginas).

## Página de inicio nueva (`odoo/landing/`)

Aparte de esta vista previa hay una página de inicio hecha desde cero, de una sola pieza, con el logo oficial y modo claro y oscuro (botón en la cabecera; la primera vez sigue al equipo, después recuerda lo elegido; `?tema=claro|oscuro` lo fuerza): portada con los banners en abanico 3D y las cifras del catálogo, destacados en un anillo 3D que se gira arrastrando, categorías que se recorren de lado con el scroll, dos cintas de logos, servicios, cómo comprar, lista de códigos que se manda por WhatsApp a ventas, preguntas frecuentes, sedes y cierre. Capturas: `capturas/landing-claro.jpg`, `landing-oscuro.jpg` (Valencia), `landing-caracas.jpg`, `landing-panama.jpg`, `landing-estantes.jpg` y `landing-carrito.png`.

**Estantes y cotización.** Cada sede tiene tres estantes (lo más pedido por facturas de 90 días, novedades de los últimos 75 días y oportunidades: lo que menos rota frente a su existencia) y combos de lo que se factura junto, todo en `datos.js` (`masVendidos`, `novedades`, `menosRotan`, `juntos`, `combos`, sacados de Odoo el 4-nov-2026). Cada producto tiene «+ Cotizar»: se suma al carrito (icono en la cabecera con las unidades y un panel lateral, como en una tienda; es una cotización, no se cobra), que se guarda en el navegador por sede y sugiere lo que se pide junto. Un enlace que termina en `#carrito` abre la página con el carrito abierto. El buscador agrega por nombre, marca o código, y si se pega una lista de códigos (o filas de Excel) la suma completa.

**Una página por sede.** El selector del menú cambia productos, categorías, marcas, banners y contacto (Valencia, Caracas, Panamá; todo en `datos.js`, sacado de lo que cada sede tiene en existencia en su almacén principal). La sede sale, en este orden, de `?sede=valencia|caracas|panama`, del dominio de la sede (`supricom.com.ve`, `caracas.supricom.com.ve`, `supricom.com.pa`), de la que el visitante eligió antes y, si no hay nada, de la zona horaria; en ese caso se le ofrece usar su ubicación (la sede más cercana) y, si ya dio el permiso antes, se usa sola. En `supricom.com` se elige en el menú. Caracas y Panamá todavía no tienen número de WhatsApp: cotizan por correo a su buzón de la tienda web (se pone el número en `whatsapp` de su sede en `datos.js`). Odoo tiene una sola tienda, con la existencia de Valencia: por eso solo Valencia enlaza a las fichas de Odoo; en las otras dos los productos se agregan a la lista de cotización y las categorías se buscan entre sus productos, hasta que tengan su sitio en Odoo (`tienda` y `tiendaPropia` en `datos.js`). No usa el HTML de Odoo: solo enlaza a la tienda real (`supricom2.odoo.com`) y toma de ahí las fotos de los productos. Los datos (productos, marcas, totales) están en `odoo/landing/datos.js`, sacados de Odoo el 3-nov-2026. Se ve en http://localhost:8765/landing/ con el mismo servidor.

## En EasyPanel, como entorno de prueba

`odoo/Dockerfile.vista-previa` arma un nginx con `landing/`, esta carpeta y las imágenes del módulo (`odoo/vista-previa.nginx.conf`: `/` lleva a `/landing/`, esta vista previa queda en `/vista-previa/` y todo sale con `X-Robots-Tag: noindex` para que Google no indexe la copia).

1. En el proyecto de EasyPanel: **+ Servicio › App**, por ejemplo `tienda-prueba`.
2. **Fuente › GitHub**: repo `chatgptsupricom-sudo/Dashboard`, la rama donde esté esta carpeta y **ruta de compilación `/odoo`**.
3. **Compilación › Dockerfile**, archivo `Dockerfile.vista-previa`.
4. **Dominios**: dejar el que da EasyPanel (`…easypanel.host`) o agregar uno propio (por ejemplo `tienda-prueba.supricom.com.ve`, con su DNS) apuntando al **puerto 80**.
5. **Implementar**. Cada push a esa rama se vuelve a publicar con **Implementar** (o activando el despliegue automático).

No usa variables de entorno ni base de datos, y no toca el panel ni Odoo.

No es la tienda en vivo: los scripts de Odoo están quitados y los íconos (flechas) no cargan desde otro dominio. En la tienda, «Agotado» es la existencia real del almacén de Valencia de esos 20 productos (todos en 0 el 3-nov-2026). Esta carpeta no se instala en Odoo; lo que se instala es solo `website_supricom_tienda/`.
