# Pendiente: capturas en los pasos de la carpeta "Proceso de ventas"

Instrucciones para el agente que continúe este trabajo. Fecha: 2026-10-09.

## Dónde estamos

- En la sección **Manuales** del panel (`/es/manuales`) están cargados 6 manuales de procedimiento, todos con `area = "Proceso de ventas"`, versión `0.1` y **sin publicar**:

  | id | código | título | pasos |
  |---|---|---|---|
  | 2 | MP-VEN-00 | Proceso de ventas: visión general | 6 |
  | 3 | MP-VEN-01 | Ventas: de la cotización al pedido confirmado | 7 |
  | 4 | MP-VEN-02 | Cuentas por Cobrar: plazos y crédito en la venta | 4 |
  | 5 | MP-VEN-03 | Facturación del pedido de venta | 3 |
  | 6 | MP-VEN-04 | Almacén: armado y despacho del pedido | 5 |
  | 7 | MP-VEN-05 | Seguridad: verificación de la salida en el portón | 2 |

- Se cargaron con `sql/manuales/proceso_de_ventas.sql` (commit `774c5b73`, rama `Dario`). Ese archivo es la fuente del texto. **Después de cargar las capturas ya no hay que volver a correrlo**: la base pasa a ser la fuente de verdad.
- El formato y los límites de cada manual están en `lib/manuales/datos.ts`. Cada paso es `{ titulo, responsable, descripcion, imagenes: number[], nota }`, con un máximo de 20 imágenes por paso. Cómo se muestra: `components/manuales/VistaManual.tsx`.
- Los manuales **no mencionan los leads** del panel; el usuario pidió sacarlos. No los agregues.
- Siguen pendientes las decisiones de la Gerencia (vigencia de la cotización, tabla de descuentos, días para cerrar una cotización, crédito con deuda vencida, quién factura). Están marcadas como "propuesta" en el texto. No las cambies.

## Qué queremos

Agregar a los pasos capturas de pantalla que muestren dónde se hace cada cosa en Odoo y en el panel. Por ejemplo:
- Odoo: formulario de cotización (cliente, vencimiento, términos de pago, columna "Desc. %", margen), botones "Enviar por correo electrónico" y "Confirmar", pestaña Otra información › Referencia del cliente, chatter con "Registrar nota", ficha del cliente con plazo y límite de crédito, botón "Crear factura".
- Panel: Método de retiro, Mercancía › Egreso › Nuevo, detalle del egreso (armado, conteo, Serializar, Asignar despacho), verificación en portón y Calificar.

No hacen falta capturas en todos los pasos: solo donde ayudan a encontrar el botón o el campo. Marca la parte importante con un recuadro o una flecha.

## Cómo hacerlo

1. **Navegador.** Usa la extensión Claude in Chrome (el usuario la prefiere). Panel de prueba: `https://dashboard-dashboard-test-dario.larlxe.easypanel.host`. Usa la base de producción, así que lo que se guarde ahí es real. Odoo está en la URL de `NEXT_PUBLIC_ODOO_URL`.
2. **Sesiones.** El usuario tiene que iniciar sesión él mismo; tú no escribes contraseñas. Para subir imágenes se necesita una sesión del **rol Procesos**: la sesión normal del usuario recibe `403` en `/api/manuales`. Para las capturas de Almacén y Seguridad hace falta un usuario de cada rol, o que el usuario las tome y te las pase.
3. **Datos sensibles.** En las capturas no deben verse datos reales de clientes (RIF, montos, nombres): usa un registro de prueba, o tapa o recorta esos datos antes de subir. No crees, confirmes ni factures pedidos reales para tomar una captura: usa uno ya existente o un borrador de prueba que luego canceles. Consulta al usuario antes de hacerlo.
4. **Formato.** PNG, JPG o WebP de máximo 4 MB (SVG no).
5. **Subir.** Con la sesión de Procesos abierta en el panel:
   - `POST /api/manuales/imagenes` (multipart, campos `manualId` y `archivo`) devuelve `{ id }`.
   - Luego `GET /api/manuales/{id}` y `PUT /api/manuales/{id}` con el manual completo, agregando los ids de las imágenes al arreglo `imagenes` del paso que corresponde. Se manda el manual completo para no borrar los demás campos.
   - Otra opción: el editor `/es/manuales/{id}/editar`, que tiene un botón para subir capturas en cada paso.
6. **Verificar.** Abre `/es/manuales/{id}` y comprueba que cada imagen aparece en su paso. Deja `publicado` en 0.
7. **Control de cambios.** Al terminar, agrega una línea en `contenido.cambios` de cada manual tocado: `{ "version": "0.2", "fecha": "<hoy>", "descripcion": "Capturas de pantalla en los pasos." }` y sube `version` a `0.2`.

## Contexto útil

- Flujo real del panel (egreso por etapas): `lib/seguridad/egresoFlujo.ts`, `app/api/seguridad/mercancia/[id]/etapa/route.ts`, `lib/ventas/metodoRetiro.ts`.
- Odoo 17. Ventas › Órdenes › Cotizaciones. El límite de crédito solo avisa, no bloquea.
- Hay una tarea aparte (no es parte de esto): asegurar `DELETE`/`PATCH` de `/api/vendedores/leads`, que hoy no verifican quién es el dueño del lead.
