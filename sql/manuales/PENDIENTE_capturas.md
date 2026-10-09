# Capturas en los pasos de la carpeta "Proceso de ventas"

Instrucciones para el agente que continúe este trabajo. Actualizado: 2026-10-09.

## Dónde estamos

- En la sección **Manuales** del panel (`/es/manuales`) hay 6 manuales con `area = "Proceso de ventas"`, todos **sin publicar**. La base es la fuente de verdad: `sql/manuales/proceso_de_ventas.sql` fue la carga inicial (versión 0.1) y **no hay que volver a correrlo**, porque ya no coincide con lo que está en la base.

  | id | código | título | versión | capturas |
  |---|---|---|---|---|
  | 2 | MP-VEN-00 | Proceso de ventas: visión general | 0.2 | ninguna (es el mapa general, no las necesita) |
  | 3 | MP-VEN-01 | Ventas: de la cotización al pedido confirmado | 0.3 | pasos 1, 2, 3, 5 y 6 |
  | 4 | MP-VEN-02 | Cuentas por Cobrar: plazos y crédito en la venta | 0.2 | pasos 1 y 3 |
  | 5 | MP-VEN-03 | Facturación del pedido de venta | 0.3 | pasos 1 y 2 |
  | 6 | MP-VEN-04 | Almacén: armado y despacho del pedido | 0.3 | pasos 1 y 4 |
  | 7 | MP-VEN-05 | Seguridad: verificación de la salida en el portón | 0.3 | paso 1 |

- Los textos ya usan los nombres reales de las pantallas: en Odoo "Correo", "% de desc.", "Registrar una nota", Ventas › Por facturar › Órdenes a facturar, y el Margen solo como total del pedido; en el panel "Despachos de mercancía" › "Registrar", "Aprobar y despachar" y "Hay novedades: decidir".
- El formato y los límites de cada manual están en `lib/manuales/datos.ts`. Cada paso es `{ titulo, responsable, descripcion, imagenes: number[], nota }`, con un máximo de 20 imágenes por paso. Cómo se muestra: `components/manuales/VistaManual.tsx`.
- Los manuales **no mencionan los leads** del panel; el usuario pidió sacarlos. No los agregues.
- Siguen pendientes las decisiones de la Gerencia (vigencia de la cotización, tabla de descuentos, días para cerrar una cotización, crédito con deuda vencida, quién factura). Están marcadas como "propuesta" en el texto. No las cambies.

## Qué falta

Capturas que no se pudieron tomar porque el 2026-10-09 no había en Valencia ningún egreso en esas etapas (solo cerrados y en portón):

- **MP-VEN-04 paso 2**: detalle del egreso con "Iniciar armado" / "Terminar armado" y el conteo por renglón.
- **MP-VEN-04 paso 3**: Empaquetado (solo encomienda).
- **MP-VEN-04 paso 4**: "Serializar" y "Asignar despacho" (ya tiene la del recibo de entrega).
- **MP-VEN-04 paso 5** y **MP-VEN-05 paso 1**: la pantalla de decisión de novedades, si se quiere mostrar.
- **MP-VEN-05 paso 2**: "Calificar".

Los nombres de esos botones en el texto de los manuales **no se han comprobado contra la pantalla**: al tomar la captura, corrige el texto si no coincide.

## Cómo hacerlo

1. **Navegador.** Usa la extensión Claude in Chrome (el usuario la prefiere). Panel de prueba: `https://dashboard-dashboard-test-dario.larlxe.easypanel.host`. Usa la base de producción, así que lo que se guarde ahí es real. Odoo: `https://supricom2.odoo.com`.
2. **Sesiones.** El usuario inicia sesión él mismo; tú no escribes contraseñas. Para subir imágenes hace falta una sesión del **rol Procesos** (cualquier otro rol recibe `403` en `/api/manuales`). El rol Procesos **solo ve Manuales**: para las capturas que faltan hace falta una sesión de Almacén y otra de Seguridad, o que el usuario las tome y te las pase. (El 2026-10-09 se le dio a Procesos un permiso temporal de solo lectura sobre esas pantallas y se revirtió al terminar: commits `cfbee25e` y su revert, por si hay que repetirlo.)
3. **Datos sensibles.** En las capturas no deben verse datos reales de clientes (RIF, montos, nombres, números de pedido, seriales). En Odoo hay un cliente de prueba, "Angel Rodriguez Prueba", con la cotización borrador `S-02381` (Valencia). Donde no hay registro de prueba, difumina los datos antes de capturar (un `filter: blur()` puesto desde la consola sirve). No crees, confirmes ni factures pedidos reales para tomar una captura sin consultar al usuario.
4. **Formato.** PNG, JPG o WebP de máximo 4 MB (SVG no). Marca lo importante con un recuadro.
5. **Subir.** Con la sesión de Procesos, en el editor `/es/manuales/{id}/editar` cada paso tiene un botón "Agregar captura" que sube la imagen (`POST /api/manuales/imagenes`). Luego hay que guardar el manual: `PUT /api/manuales/{id}` con el manual completo (el `GET` devuelve `{ manual }`), para no borrar los demás campos.
6. **Verificar.** Abre `/es/manuales/{id}` y comprueba que cada imagen aparece en su paso. Deja `publicado` en 0.
7. **Control de cambios.** Sube la versión y agrega una línea en `contenido.cambios` de cada manual tocado.

## Contexto útil

- Flujo real del panel (egreso por etapas): `lib/seguridad/egresoFlujo.ts`, `app/api/seguridad/mercancia/[id]/etapa/route.ts`, `lib/ventas/metodoRetiro.ts`.
- Las pantallas de mercancía muestran los botones según el rol de la sesión (`components/seguridad/EgresoFlujo.tsx`): los de armado y despacho solo con Almacén, los de portón y calificación solo con Seguridad.
- Odoo 17. Ventas › Órdenes › Cotizaciones. El límite de crédito solo avisa, no bloquea.
- Hay una tarea aparte (no es parte de esto): asegurar `DELETE`/`PATCH` de `/api/vendedores/leads`, que hoy no verifican quién es el dueño del lead.
