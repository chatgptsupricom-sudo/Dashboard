# [Seguridad] 4/5: Sistema de calificación 1-5 estrellas del almacenista

## Contexto

El portal RMA público y el panel interno están centrados en el **equipo**: el
cliente reporta, el técnico repara, el Seguridad mueve. Pero hay un cuarto
actor que se pierde: el **almacenista que físicamente recibe y entrega el
equipo**. Si ese almacenista trata mal al cliente, o entrega un equipo en peor
estado del que recibió, hoy no hay forma de medirlo.

Este issue agrega un sistema de calificación 1-5 estrellas al almacenista,
igual al que tienen apps de delivery: el cliente y/o el técnico califican al
almacenista en el momento del ingreso o del despacho.

## Depende de

- #1 (Base)
- #2 (Recepción) — la calificación del ingreso ocurre cuando el técnico recibe
  el equipo del Seguridad
- #3 (Despacho) — la calificación del despacho ocurre cuando el cliente retira

## Decisiones a tomar antes de codear

1. **¿Quién califica al almacenista?** Opciones:
   - **Solo el técnico** — califica al Seguridad que recibió el equipo (cuando
     lo abre y ve el estado real)
   - **Solo el cliente** — califica al Seguridad que le entregó (cuando retira)
   - **Ambos** — más completo pero más fricción
   - **Recomendación**: ambos. El técnico evalúa la calidad de la recepción, el
     cliente evalúa la entrega. Dos señales distintas.

2. **¿Cuándo se muestra la opción de calificar?**
   - **Ingreso**: cuando el técnico abre el caso y compara el acta del
     Seguridad con lo que encuentra. Lo natural es un botón en el detalle del
     RMA interno.
   - **Despacho**: cuando el cliente retira. Puede ser en la pantalla de
     confirmación del despacho (el Seguridad lo llena por el cliente si este
     no tiene acceso) o por email/SMS al cliente después.

3. **¿Se muestra la calificación al público?**
   - NO en el portal público. La calificación es interna, para gestión de
     personal.
   - SÍ en el dashboard del Seguridad (issue #5): cada almacenista ve su
     promedio.

## Lo que hay que hacer

### 1. UI de calificación en el detalle del RMA interno

Cuando el técnico abre un caso del RMA que tiene un ingreso (vinculado vía
`ingreso_id` o `rma_case_id`), al lado del bloque "Seguridad que recibió el
equipo" aparece un componente:

```
┌────────────────────────────────────────────────────────┐
│ Recepción de almacén                                   │
│                                                         │
│ Recibido por: Pedro Ramirez                             │
│ Fecha: 2026-08-25                                       │
│ Accesorios íntegros: ✓  Sin manipulación: ✓              │
│ Dentro de la fecha: ✓  Garantía: ✗                      │
│                                                         │
│ Califica al Seguridad:                                  │
│ ☆☆☆☆☆  [Comentario opcional]            [Guardar]      │
└────────────────────────────────────────────────────────┘
```

5 estrellas clickeables, comentario opcional de 500 chars, botón guardar.
Una vez guardada, la calificación se ve y no se puede editar (o sí, con
botón "cambiar" — decidir).

### 2. UI de calificación en el despacho

Cuando el Seguridad cierra un despacho, aparece el mismo componente. El
Seguridad puede pedir al cliente que lo llene en su teléfono (la pantalla
está pensada mobile-first), o el Seguridad lo llena por el cliente y le
pregunta verbalmente.

Endpoint: `POST /api/seguridad/despacho/[id]/calificar` (id del despacho).

### 3. Endpoint genérico de calificación

```typescript
// POST /api/seguridad/calificar
{
  "tipo": "ingreso" | "despacho",
  "relacionado_id": 42,
  "calificacion": 5,           // 1 a 5
  "comentario": "Buen trato",
  "calificado_por": "ING. Manuel García (Técnico OSC)"
}
```

`calificado_por` es texto libre (nombre del que califica, no ID de usuario —
porque puede ser el cliente, sin login).

### 4. Endpoint para ver el promedio

`GET /api/seguridad/almacenista/[nombre]/calificaciones`

Devuelve:
- Promedio de estrellas (1 decimal)
- Cantidad de calificaciones
- Distribución: cuántas de 1, cuántas de 2, ..., cuántas de 5
- Lista de los últimos N comentarios

Esto es lo que muestra el dashboard del Seguridad (#5).

### 5. Schema

```sql
CREATE TABLE IF NOT EXISTS seguridad_calificaciones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  almacenista_nombre VARCHAR(200) NOT NULL,
  -- el nombre del Seguridad/almacenista que recibio o entrego
  calificacion TINYINT NOT NULL,
  -- 1 a 5
  relacionado_a ENUM('ingreso','despacho') NOT NULL,
  relacionado_id INT NOT NULL,
  -- id del ingreso o despacho
  comentario VARCHAR(500) DEFAULT NULL,
  calificado_por VARCHAR(200) NOT NULL,
  -- nombre del que califico (tecnico o cliente)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_almacenista (almacenista_nombre),
  INDEX idx_relacionado (relacionado_a, relacionado_id),
  INDEX idx_fecha (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Validación: `calificacion` debe estar entre 1 y 5. Check en MySQL + zod en el
endpoint. Si se intenta calificar dos veces el mismo ingreso/despacho,
rechazar con409 — o permitir cambiar? Sugerencia: rechazar por ahora, es más
limpio, y si necesitan editar se hace por DB.

### 6. Mostrar estrellas en el listado de ingresos/despachos

En la tabla del listado (issue #2 y #3), agregar una columna con el
promedio de estrellas del almacenista que aparece en esa fila. Ej: si
"Pedro Ramirez" tiene promedio 4.7, mostrar "★★★★☆ 4.7" en la fila.

Esto requiere join con `seguridad_calificaciones` (subquery AVG). Se puede
optimizar con una vista materializada más adelante si la tabla crece.

### 7. Privacidad

- El comentario NO se muestra al cliente (es interno).
- El promedio por almacenista NO se muestra al cliente.
- Los técnicos ven las calificaciones que ellos dieron.
- Los almacenistas ven su propio promedio y comentarios (en el dashboard #5).

## Criterio de aceptación

- El técnico puede calificar al Seguridad que recibió un caso (1-5 + comentario)
- El Seguridad puede calificar (en nombre del cliente) al almacenista que
  entregó
- La calificación se guarda con check 1-5 (no se aceptan otros valores)
- Si ya hay calificación para un mismo ingreso/despacho, se rechaza (409)
- El promedio del almacenista se calcula correctamente
- La calificación no aparece en el portal público del cliente
- El listado de ingresos/despachos muestra el promedio del almacenista
- El dashboard del Seguridad (#5) consume el endpoint de promedio