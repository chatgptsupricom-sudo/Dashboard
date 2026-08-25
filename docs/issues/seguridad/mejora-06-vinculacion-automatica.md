# [Seguridad Mejora 6/6] Vinculación automática ingresos ↔ tickets del portal

## Contexto

Hoy, cuando el cliente reporta una falla desde supricom.com.ve (#18-#26), el
ticket cae en `rma_cases` con `origen='portal'` y `tracking_token`. El cliente
recibe un número de ticket y puede consultar el estatus.

Luego el cliente trae el equipo al almacén. El Seguridad registra un ingreso
en `seguridad_ingresos` y opcionalmente vincula `rma_case_id` (lo pega
manualmente buscándolo en `/api/seguridad/buscar-ticket/{case}`).

Esto tiene un problema: si el cliente **no tiene su número de ticket a
mano** (lo perdió, no le llegó el email), el Seguridad tiene que buscarlo por
cliente/serial/factura, lo cual es lento y propenso a errores.

La mejora es **notificación proactiva al Seguridad** cuando se crea un ticket
del portal: que le llegue un push/sonido al móvil del mostrador diciendo
"ticket nuevo #0042 del cliente Distribuidora XYZ".

## Lo que hay que hacer

### 1. Notificación Socket.io al crear ticket del portal

En `app/api/servicio-tecnico/ticket/route.ts`, después del INSERT exitoso
(y del socket emit `rma_ticket_nuevo` que ya existe), emitir otro evento:

```typescript
(global as any).io.emit("seguridad_ticket_nuevo", {
  case_number: caseNumber,
  tracking_token: trackingToken,
  client_name: lookup.partner_name,
  invoice_number: invoiceNumber,
  product: matchedProduct.product_name,
  serial: clientSerial || matchedProduct.serials[0] || null,
});
```

El módulo Seguridad escucha este evento. Como el portal y el módulo
Seguridad son dos frontends separados, el socket ya está montado en
`server.js`.

### 2. UI: indicador en tiempo real en el mostrador

En `app/[locale]/seguridad/mostrador/page.tsx`:

- Suscribirse al evento `seguridad_ticket_nuevo`
- Mostrar un toast con sonido cuando llega un evento
- Toast: "🔔 Nuevo ticket #{case_number} de {client_name}"
- Botón en el toast: "Crear ingreso" → abre el formulario con el ticket
  pre-llenado

### 3. Cola de tickets pendientes sin ingreso

Crear `GET /api/seguridad/tickets-sin-ingreso` que devuelve los tickets del
portal que NO tienen un ingreso vinculado:

```sql
SELECT r.id, r.case_number, r.client_name, r.hardware, r.serial, r.invoice_number, r.created_at
FROM rma_cases r
LEFT JOIN seguridad_ingresos i ON i.rma_case_id = r.id
WHERE r.origen = 'portal' AND i.id IS NULL
ORDER BY r.created_at DESC
LIMIT 50
```

### 4. UI: panel de tickets pendientes

En `/seguridad/mostrador`:

- Sección "Tickets sin ingreso" arriba del flujo principal
- Lista compacta: ticket, cliente, hardware, tiempo desde creación
- Cada item tiene un botón "Crear ingreso para este ticket" → abre el
  formulario pre-llenado

### 5. Auto-refresh

Los tickets pendientes se refrescan cada 30 segundos (polling) o cuando
llega un evento Socket.io nuevo.

## Criterio de aceptación

- Cuando el cliente crea un ticket del portal, el Seguridad recibe un push
  en su móvil (si está en `/seguridad/mostrador`) en menos de 5 segundos
- El toast incluye número de ticket, cliente y un link directo al
  formulario pre-llenado
- El panel de "Tickets sin ingreso" muestra todos los tickets del portal que
  no han sido procesados por el almacén
- Refresco automático cada 30 segundos o cuando llega un nuevo evento
- Después de crear el ingreso, el ticket desaparece del panel

## Estimación

- Socket emit adicional en el portal: 30 minutos
- UI toast en el mostrador: 2 horas (Socket.io subscription + toast UI)
- Endpoint tickets-sin-ingreso: 1 hora
- Panel en el mostrador: 1.5 horas
- Auto-refresh + integración: 1 hora
- Tests (Socket.io en tiempo real): 1.5 horas
- **Total: ~7-8 horas**

## Impacto

Esta mejora cierra el círculo del flujo del portal RMA:

```
Cliente reporta → ticket cae en rma_cases (issue #22)
       ↓
🔔 Notificación al Seguridad en tiempo real (esta mejora)
       ↓
Seguridad registra ingreso vinculado al ticket (issue #2)
       ↓
Técnico repara
       ↓
Seguridad despacha (issue #3)
       ↓
Calificación (issue #4)
```

Sin esta mejora, hay un "gap" entre el ticket del portal y el ingreso del
Seguridad: si el cliente llega al almacén sin su número de ticket, el
proceso es lento. Con esta mejora, el Seguridad ve el ticket inmediatamente
y puede atenderlo en menos tiempo.