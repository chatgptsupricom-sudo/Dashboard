# [Seguridad] 3/5: Despacho de mercancía (egreso del taller)

## Contexto

Cuando el técnico termina la reparación, el **Seguridad** (o el almacenista)
es el responsable de hacer la entrega del equipo al cliente. Es el momento
opuesto al ingreso: ahora hay que registrar **quién entrega** (no quién
recibió), **qué facturas se incluyen** en el despacho (importante para
trazabilidad), y **cuándo**.

La planilla física tiene estos campos para el despacho:

```
FECHA DE DESPACHO:
Recibe:         (firma/nombre del cliente que retira)
Almacén:        (firma del que entrega)
Seguridad de OSC (firma/aval del supervisor)
```

Y un bloque "Recibe / Almacén / Seguridad de OSC" en la parte inferior con
los tres nombres (técnico, almacenista, seguridad).

Este issue digitaliza el despacho.

## Depende de

- #1 (Base)
- #2 (Recepción) — para vincular al ingreso original

## Lo que hay que hacer

### 1. Pantalla de despacho

`app/[locale]/seguridad/despacho/nuevo/page.tsx`

Dos modos:

**A) Despacho desde un ingreso**: el Seguridad busca un ingreso existente
(recepción), confirma que ya está reparado, y registra el despacho.

**B) Despacho directo** (sin ingreso previo, ej: venta de mostrador): el
Seguridad llena los datos desde cero.

Formulario:

- **Ingreso vinculado** (opcional, autocomplete por cliente/serial/ticket)
- **Fecha de despacho** (default hoy)
- **Almacenista que entrega** (default: usuario Seguridad logueado, se puede
  cambiar si el que despacha es otro)
- **Facturas incluidas** (array: el Seguridad selecciona o escanea varias
  facturas para incluir en este despacho — ej: cuando un cliente retira
  varios equipos reparados, las facturas asociadas se asocian al mismo
  despacho)
- **Cliente que retira** (texto + opcional RIF/DNI para confirmar identidad)
- **Accesorios íntegros** (check — se confirma que salen igual que entraron)
- **Observaciones** (textarea, opcional)
- **Firma digital** — el cliente firma en pantalla. Esto se puede diferir a
  un issue de UI, pero el campo se guarda desde ya (ruta al PNG o al storage).

### 2. Endpoint de creación

`POST /api/seguridad/despacho`

```json
{
  "ingreso_id": 42,                       // opcional, vincula al ingreso
  "rma_case_id": 1234,                   // opcional, vincula al ticket
  "fecha_despacho": "2026-08-25",
  "almacenista_nombre": "Pedro Ramirez", // el que entrega
  "facturas": ["INV/2026/06384", "FAC-00923"],
  "cliente_retira": "Distribuidora XYZ (J-12345678)",
  "accesorios_integros": true,
  "observaciones": "Se entrega con todos los cables"
}
```

`facturas` se guarda como JSON string en MySQL (columna TEXT).

Validación con zod. Limites:
- `almacenista_nombre`: max 200
- `facturas`: array de max 50 items, cada uno max 100 chars
- `cliente_retira`: max 200
- `observaciones`: max 5000

### 3. Listado de despachos

`app/[locale]/seguridad/despacho/page.tsx`

Tabla con:
- Fecha
- Cliente que retira
- Almacenista
- N° de facturas (count)
- Vinculado a ingreso (badge)

Filtros: rango de fechas, por almacenista, por cliente.

### 4. Detalle del despacho

`app/[locale]/seguridad/despacho/[id]/page.tsx`

Muestra todo + el ingreso original (si está vinculado) + el ticket del RMA
interno. Botón para imprimir el comprobante de despacho (PDF simple, con los
datos del despacho + la firma si está guardada).

### 5. Conectar con el ticket del RMA

Cuando un despacho está vinculado a un `rma_case_id`, el ticket del RMA
interno debe cambiar de status automáticamente a `"despachado"` (nuevo status).
Esto es optativo y se puede hacer via un trigger en MySQL o en el endpoint
POST.

**Decidir con el equipo de RMA**: ¿quieren un nuevo status `despachado` o
sirve `reparado` (ya existe)? Sugerencia: nuevo status `despachado` para
distinguir "el técnico terminó" de "el cliente retiró".

### 6. Calificación (preview del #4)

Cuando el despacho se cierra, se le pide al cliente (por pantalla o por email)
que califique al almacenista. UI: 5 estrellas + comentario. Diferir la parte
de UI al #4, pero el endpoint puede aceptar la calificación desde ya.

## Schema final

```sql
CREATE TABLE IF NOT EXISTS seguridad_despachos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ingreso_id INT DEFAULT NULL,
  rma_case_id INT DEFAULT NULL,
  fecha_despacho DAT: NOT NULL,
  almacenista_nombre VARCHAR(200) NOT NULL,
  facturas_json TEXT DEFAULT NULL,
  -- JSON array de numeros de factura
  cliente_retira VARCHAR(200) DEFAULT NULL,
  accesorios_integros TINYINT(1) DEFAULT 1,
  observaciones TEXT DEFAULT NULL,
  firma_url VARCHAR(500) DEFAULT NULL,
  -- ruta al PNG de la firma digital (issue futuro)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_fecha (fecha_despacho),
  INDEX idx_almacenista (almacenista_nombre),
  INDEX idx_ingreso (ingreso_id),
  INDEX idx_rma_case (rma_case_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

## Criterio de aceptación

- El Seguridad puede crear un despacho desde `/seguridad/despacho/nuevo`
- Puede vincularlo a un ingreso existente (autocomplete por cliente/serial)
- El listado de despachos filtra por fecha y almacenista
- El detalle del despacho muestra todo + ingreso vinculado + ticket
- El endpoint rechaza payloads malformados con 400
- Si está vinculado a un `rma_case_id`, el ticket cambia a `despachado`
  (decidir si esto es automático o manual)
- El cliente puede firmar en pantalla (aunque sea opcional)
- **El Seguridad NO ve montos** — solo ve el número de factura