# Vista previa del módulo

Las páginas reales de supricom2.odoo.com (inicio, tienda y una ficha, guardadas el 3-nov-2026) con el módulo `website_supricom_tienda` aplicado encima: su CSS compilado (`tienda.css`), su JS (`vista-previa.js`, con un reemplazo mínimo de lo que en Odoo hace publicWidget) y, en el inicio, sus tres bloques en lugar de las secciones de antes.

Para verla hay que servir la carpeta `odoo/` (abrir los .html con doble clic no carga el CSS ni las imágenes):

    python -m http.server 8765 --directory odoo

y abrir http://localhost:8765/vista-previa/ (la portada enlaza las tres páginas).

## En EasyPanel, como entorno de prueba

`odoo/Dockerfile.vista-previa` arma un nginx con esta carpeta y las imágenes del módulo (`odoo/vista-previa.nginx.conf`: `/` lleva a `/vista-previa/` y todo sale con `X-Robots-Tag: noindex` para que Google no indexe la copia).

1. En el proyecto de EasyPanel: **+ Servicio › App**, por ejemplo `tienda-prueba`.
2. **Fuente › GitHub**: repo `chatgptsupricom-sudo/Dashboard`, la rama donde esté esta carpeta y **ruta de compilación `/odoo`**.
3. **Compilación › Dockerfile**, archivo `Dockerfile.vista-previa`.
4. **Dominios**: dejar el que da EasyPanel (`…easypanel.host`) o agregar uno propio (por ejemplo `tienda-prueba.supricom.com.ve`, con su DNS) apuntando al **puerto 80**.
5. **Implementar**. Cada push a esa rama se vuelve a publicar con **Implementar** (o activando el despliegue automático).

No usa variables de entorno ni base de datos, y no toca el panel ni Odoo.

No es la tienda en vivo: los scripts de Odoo están quitados y los íconos (flechas) no cargan desde otro dominio. En la tienda, «Agotado» es la existencia real del almacén de Valencia de esos 20 productos (todos en 0 el 3-nov-2026). Esta carpeta no se instala en Odoo; lo que se instala es solo `website_supricom_tienda/`.
