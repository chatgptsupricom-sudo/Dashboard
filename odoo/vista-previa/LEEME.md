# Vista previa del módulo

Las páginas reales de supricom2.odoo.com (inicio, tienda y una ficha, guardadas el 3-nov-2026) con el módulo `website_supricom_tienda` aplicado encima: su CSS compilado (`tienda.css`), su JS (`vista-previa.js`, con un reemplazo mínimo de lo que en Odoo hace publicWidget) y, en el inicio, sus tres bloques en lugar de las secciones de antes.

Para verla hay que servir la carpeta `odoo/` (abrir los .html con doble clic no carga el CSS ni las imágenes):

    python -m http.server 8765 --directory odoo

y abrir http://localhost:8765/vista-previa/inicio.html, tienda.html o ficha.html.

No es la tienda en vivo: los scripts de Odoo están quitados y los íconos (flechas) no cargan desde otro dominio. En la tienda, «Agotado» es la existencia real del almacén de Valencia de esos 20 productos (todos en 0 el 3-nov-2026). Esta carpeta no se instala en Odoo; lo que se instala es solo `website_supricom_tienda/`.
