# [Seguridad] 2/5: Recepción de equipo (ingreso al taller)

## Contexto

Cuando el cliente (o el vendedor) trae un equipo al almacén de OSC para que
sea reparado, el **Seguridad** registra la recepción. Es la primera impresión
del estado del producto — antes de que el técnico lo abra, ya hay un acta
digital de cómo llegó.

La planilla física (RECEPCIÓN Y DESPACHO DE RMA) tiene estos campos:

```
FECHA DE ENTREGA (ALMACÉN):
N° FACTURA DE VENTA:
CLIENTE:
HARDWARE:
NÚMERO DE SERIE O CÓDIGO:
DESCRIPCIÓN DE LA FALLA:
[ ] Accesorios íntegros
[ ] Sin manipulación
[ ] Dentro de la fecha
[ ] Falla cubierta por garantía
FECHA DE DESPACHO:    (lo llena el despacho, no la recepción)
Recibe:               (firma/nombre del que recibe)
```

Este issue convierte esa planilla en formulario digital.

## Depende de

- #1 (Base: ruta, layout y middleware)

## Lo que hay que hacer

### 1. Pantalla de recepción

`app/[locale]/seguridad/ingreso/nuevo/page.tsx`

Formulario con los campos de la planilla:

- **Fecha de entrega** (default: hoy, en timezone America/Caracas)
- **N° de factura de venta** (opcional, para rastreo)
- **Cliente** (texto o selector si viene del portal — ver #2)
- **Hardware** (texto o selector)
- **Número de serie o código** (texto o selector)
- **Descripción de la falla** (textarea grande, min 10 chars)
- **4 checks**:
  - Accesorios íntegros
  - Sin manipulación
  - Dentro de la fecha (de garantía)
  - Falla cubierta por garantía
- **Recibido por** (default: nombre del usuario Seguridad logueado)

Si el cliente reportó por el portal público (issue #18-26), el ticket ya
tiene hardware, serie y falla. **El formulario debe poder pre-llenarse desde
un `rma_case_id`**: el Seguridad busca el número de ticket o escanea el código
y el form se llena solo.

### 2. Endpoint de creación

`POST /api/seguridad/ingreso`

```json
{
  "rma_case_id": 1234,           // opcional, vincula al ticket del portal
  "fecha_entrega": "2026-08-25", // default hoy
  "factura_numero": "INV/2026/06384",
  "cliente_nombre": "Distribuidora XYZ",
  "hardware": "Impresora HP Smart Tank 580",
  "serial": "SN-12345678",
  "descripcion_falla": "No enciende, ya revise el cable",
  "accesorios_integros": true,
  "sin_manipulacion": true,
  "dentro_de_fecha": true,
  "falla_cubierta_garantia": true,
  "recibido_por": "Juan Perez (Seguridad OSC)"
}
```

Validación con zod, todos los strings con max length, error genérico al cliente
si falla Odoo (que para este endpoint no aplica, pero mantener el patrón del
resto del portal).

### 3. Ver los adjuntos del cliente (fotos/video)

Si el ingreso está vinculado a un `rma_case_id`, el Seguridad puede ver los
adjuntos que subió el cliente (issue #21). Galería + reproductor de video.

Endpoint: `GET /api/seguridad/ingreso/[id]/adjuntos` — devuelve la lista de
adjuntos del `rma_case` vinculado, sin el binario (igual que ya hace el
endpoint interno de RMA en el panel).

Servir el binario: reutilizar `app/api/servicio-tecnico/ticket/adjuntos/[token]/[id]/route.ts`
(ya está autenticado y con tokens seguros — no exponer públicamente).

### 4. Listado de ingresos

`app/[locale]/seguridad/ingreso/page.tsx` (índice)

Tabla con los ingresos del Seguridad logueado (o todos, según permisos):
- Fecha
- Cliente
- Hardware
- 4 checks (como badges: verde/rojo)
- Recibido por

Filtros: rango de fechas, búsqueda por cliente/serial, solo "dentro de
garantía" / solo "fuera de garantía".

### 5. Detalle del ingreso

`app/[locale]/seguridad/ingreso/[id]/page.tsx`

Muestra todos los datos + los adjuntos del portal + el ticket del RMA si está
vinculado (link al detalle del RMA interno para el técnico).

### 6. Calificación (preview del #4)

Al cerrar un ingreso (cuando el técnico termina el trabajo y se hace el
despacho #3), se le pide al técnico que califique al Seguridad que recibió el
equipo. UI: 5 estrellas + comentario opcional.

Para no romper la dependencia, esto se puede diferir al issue #4.

## Schema final

```sql
CREATE TABLE IF NOT EXISTS seguridad_ingresos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  rma_case_id INT DEFAULT NULL,
  fecha_entrega DAT: NOT NULL,
  factura_numero VARCHAR(100) DEFAULT NULL,
  cliente_nombre VARCHAR(200) NOT NULL,
  hardware VARCHAR(200) DEFAULT NULL,
  serial VARCHAR(200) DEFAULT NULL,
  descripcion_falla TEXT DEFAULT NULL,
  accesorios_integros TINYINT(1) DEFAULT 1,
  sin_manipulacion TINYINT(1) DEFAULT 1,
  dentro_de_fecha TINYINT(1) DEFAULT 1,
  falla_cubierta_garantia TINYINT(1) DEFAULT 0,
  recibido_por VARCHAR(200) NOT NULL,
  foto_estado_url VARCHAR(500) DEFAULT NULL,
  -- foto que toma el Seguridad al recibir
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_fecha (fecha_entrega),
  INDEX idx_cliente (cliente_nombre),
  INDEX idx_rma_case (rma_case_id),
  INDEX idx_recibido (recibido_por)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

(Foreign key a `rma_cases(id)` opcional — si el caso no existe aún, el
ingreso se guarda igual y se vincula después.)

## Criterio de aceptación

- El Seguridad puede crear un ingreso desde la pantalla `/seguridad/ingreso/nuevo`
- Si pega un número de ticket del portal, el form se pre-llena con hardware,
  serie, falla y muestra los adjuntos del cliente
- Los 4 checks son obligatorios (accesorios, manipulación, fecha, garantía)
- El listado de ingresos filtra por fecha y cliente
- El detalle del ingreso muestra todo + adjuntos si los hay
- El endpoint rechaza payloads malformados con 400
- El Seguridad NO ve el monto de la factura — solo el número