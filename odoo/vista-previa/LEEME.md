# Vista previa del módulo

Las páginas reales de supricom2.odoo.com (inicio, tienda y una ficha, guardadas el 3-nov-2026) con el módulo `website_supricom_tienda` aplicado encima: su CSS compilado (`tienda.css`), su JS (`vista-previa.js`, con un reemplazo mínimo de lo que en Odoo hace publicWidget) y, en el inicio, sus tres bloques en lugar de las secciones de antes.

Para verla hay que servir la carpeta `odoo/` (abrir los .html con doble clic no carga el CSS ni las imágenes):

    python -m http.server 8765 --directory odoo

y abrir http://localhost:8765/vista-previa/ (la portada enlaza las tres páginas).

## Página de inicio nueva (`odoo/landing/`)

Aparte de esta vista previa hay una página de inicio hecha desde cero, de una sola pieza: portada con los banners en abanico 3D, cinta de logos, destacados en un anillo 3D que se gira arrastrando, categorías que se recorren de lado con el scroll, cómo comprar, lista de códigos que se manda por WhatsApp a ventas, sedes y cierre. No usa el HTML de Odoo: solo enlaza a la tienda real (`supricom2.odoo.com`) y toma de ahí las fotos de los productos. Los datos (productos, marcas, totales) están en `odoo/landing/datos.js`, sacados de Odoo el 3-nov-2026. Se ve en http://localhost:8765/landing/ con el mismo servidor.

## En EasyPanel, como entorno de prueba

`odoo/Dockerfile.vista-previa` arma un nginx con `landing/`, esta carpeta y las imágenes del módulo (`odoo/vista-previa.nginx.conf`: `/` lleva a `/landing/`, esta vista previa queda en `/vista-previa/` y todo sale con `X-Robots-Tag: noindex` para que Google no indexe la copia).

1. En el proyecto de EasyPanel: **+ Servicio › App**, por ejemplo `tienda-prueba`.
2. **Fuente › GitHub**: repo `chatgptsupricom-sudo/Dashboard`, la rama donde esté esta carpeta y **ruta de compilación `/odoo`**.
3. **Compilación › Dockerfile**, archivo `Dockerfile.vista-previa`.
4. **Dominios**: dejar el que da EasyPanel (`…easypanel.host`) o agregar uno propio (por ejemplo `tienda-prueba.supricom.com.ve`, con su DNS) apuntando al **puerto 80**.
5. **Implementar**. Cada push a esa rama se vuelve a publicar con **Implementar** (o activando el despliegue automático).

No usa variables de entorno ni base de datos, y no toca el panel ni Odoo.

No es la tienda en vivo: los scripts de Odoo están quitados y los íconos (flechas) no cargan desde otro dominio. En la tienda, «Agotado» es la existencia real del almacén de Valencia de esos 20 productos (todos en 0 el 3-nov-2026). Esta carpeta no se instala en Odoo; lo que se instala es solo `website_supricom_tienda/`.
