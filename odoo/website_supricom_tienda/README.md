# SUPRICOM - Tienda web (`website_supricom_tienda`)

Módulo de Odoo 17 con el rediseño de la tienda (propuesta A, nov-2026). El lienzo con el antes, el después y el plan está en
https://claude.ai/artifact/BXdFhxDaJiRxueRCHJfmZt.

**No es un tema.** No hay que usar «Cambiar de tema» en el sitio, porque eso borra lo que ya está armado con `theme_clean`. Se instala como cualquier módulo, encima del tema actual y de `supricom_web` («Solo cotización»), que siguen funcionando igual.

## Qué trae

| Parte | Qué hace |
|---|---|
| Estilos (`static/src/scss/tienda.scss`) | Franja superior del encabezado en oscuro, tarjetas de producto con bordes redondeados que suben al pasar el mouse, títulos en negro (no en azul) y botones más marcados. |
| Bloque **Banners 3D** | Carrusel con el banner activo al frente y los de los lados inclinados, sobre un piso de cuadrícula. Pasa solo cada 5,5 s, se detiene con el mouse encima y tiene pastillas con el nombre de cada banner. Trae los 4 banners que ya usa el sitio. |
| Bloque **Cinta de marcas** | Logos de 12 marcas en recuadros que pasan solos. Cada uno lleva a la búsqueda de esa marca. |
| Bloque **Categorías** | 8 recuadros con la foto de un producto real que se inclinan al pasar el mouse. |
| «Disponible» / «Agotado» | En cada tarjeta de la tienda, con lo libre (a mano menos reservado) del almacén del sitio. **Nunca muestra cantidades** (decisión de la dirección comercial). Solo para productos almacenables. |

Los tres bloques aparecen en el editor del sitio, en el panel de bloques.

## Instalación (Odoo.sh)

1. Copiar la carpeta `website_supricom_tienda` al repositorio de módulos de Odoo.sh, donde están `supricom_web` y los demás.
2. Subirla primero a una rama de **staging**, no a producción.
3. En la base de staging: Aplicaciones › Actualizar lista de aplicaciones › buscar «SUPRICOM - Tienda web» › Instalar.
4. Revisar la tienda (`/shop`), una ficha y el inicio con un usuario de portal de prueba y sin sesión.
5. Si todo está bien, pasar la rama a producción e instalar ahí.

Para quitarlo: desinstalar el módulo. Los bloques que se hayan puesto en el inicio quedan en la página, sin estilos ni animación, y se borran desde el editor.

## Armar el inicio

En el sitio, con el editor (Editar):

1. Arrastrar **Banners 3D** arriba del todo, en lugar del carrusel actual, y borrar el carrusel viejo.
2. Debajo, **Cinta de marcas**.
3. Debajo, **Categorías**.
4. Borrar las 4 secciones de antes («Mayorista de tecnología…», «Periféricos PC…», etc.). Sus carruseles no tienen filtro y muestran todos los mismos productos.

En el editor los banners se ven en fila (sin el efecto 3D), para poder cambiar cada imagen y su enlace. Cada banner, marca y categoría se puede duplicar, mover o borrar.

- **Banner nuevo:** duplicar uno, cambiarle la imagen (1920 × 638 px) y el enlace. El nombre de la pastilla sale del atributo `data-nombre` del enlace; si no tiene, dice «Banner N».
- **Velocidad:** el atributo `data-intervalo` (en milisegundos) de `.s_supricom_banners_escena`.

## Antes de abrir la tienda (no lo hace este módulo)

El módulo cambia cómo se ve la tienda, no los datos. Esto se hace en Odoo con un usuario administrador (etapas 1 y 2 del plan):

- **Arreglos:**
  - Despublicar «PRODUCTO DE PRUEBA WEB (NO VENDER)» (id 112309).
  - Quitar del menú Empleos, Cursos y Citas.
  - Corregir el enlace de Instagram.
- **Políticas:** crear las páginas de envíos, garantía y términos.
- **Categorías de la tienda:** crearlas en Sitio web › eCommerce › Categorías (hoy no hay ninguna). Después, en el editor, cambiar el enlace de cada recuadro del bloque Categorías, que hoy lleva a una búsqueda (`/shop?search=impresora`), por el de su categoría (`/shop/category/...`).
- **Precios:** 1.300 productos publicados tienen precio 0 en la lista web (15866) y 137 no tienen precio. Esos salen «No está disponible para venta» también para el cliente con cuenta.
- **Publicar:** 313 productos tienen existencia en el almacén del sitio pero no están publicados.
- **Disponibilidad:** en Sitio web › Ajustes › Inventario, dejar «Continuar vendiendo» como se decida y **no** activar «Mostrar cantidad disponible», porque no se muestran cantidades.

## Pendientes

- **Logos de Klip Xtreme y Xtech:** salen con el nombre escrito porque no se encontró un logo usable. Cuando Mercadeo los tenga, cambiar el recuadro por una imagen desde el editor.
- **Origen de los logos:** los de HP, Canon, TP-Link, Logitech, Epson, Kingston y Targus son de Wikimedia; los de Havit y Nexxt, de sus sitios oficiales; el de EZVIZ, de companieslogo.com. A Kingston y EZVIZ se les pasaron los colores del bloque `<style>` a cada figura.
- **Fotos de Categorías:** son de productos concretos (`/web/image/product.template/<id>/image_512`). Si se archiva alguno de esos productos, cambiar la foto desde el editor.
- **Una tienda por sede:** el módulo no crea los sitios de Caracas y Panamá. Los estilos y bloques sirven igual en todos los sitios de la base.
