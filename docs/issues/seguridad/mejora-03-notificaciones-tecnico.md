# [Seguridad Mejora 3/6] Notificaciones al técnico cuando hay ingresos pendientes

## Contexto

El dashboard del Seguridad (#34) tiene una alerta "En taller > 7d" que
muestra los ingresos sin despacho por más de 7 días. Pero esto es pasivo:
el Seguridad ve la alerta si abre el dashboard. Lo que falta es **notificación
proactiva** al equipo técnico cuando un ingreso está pendiente demasiado
tiempo, para que ellos presionen al almacén a despachar.

El repo ya tiene infraestructura de notificaciones:
- `lib/socket-emit.ts` y `lib/socket-client.ts` para Socket.io
- `N8N_LEAD_WEBHOOK_URL` y `N8N_REASSIGN_WEBHOOK_URL` configurados en `.env`
- Socket.io emite `kpis_updated` y `rma_ticket_nuevo` (ver `app/api/cron/calculate-kpis/route.ts` y `app/api/servicio-tecnico/ticket/route.ts`)

## Lo que hay que hacer

### 1. Cron job diario

Crear `app/api/cron/check-ingresos-pendientes/route.ts`:

- Endpoint protegido por `CRON_SECRET` (mismo patrón que
  `app/api/cron/calculate-kpis/route.ts`)
- Lógica:
  1. Buscar ingresos sin despacho vinculado con `fecha_entrega < CURDATE() - INTERVAL 7 DAY`
  2. Agrupar por equipo técnico (vía `rma_cases.assigned_technician_id` o el
     campo que tengan en su BD)
  3. Para cada técnico con ingresos pendientes, emitir un evento Socket.io
     `ingresos_pendientes_alerta` con `{ count, oldest_days, ingresos: [...] }`
  4. Si `N8N_LEAD_WEBHOOK_URL` está configurado, mandar un POST con la lista
     para que n8n mande WhatsApp/email
- Devolver `{ checked: N, alerts_sent: M }`

### 2. Agregar al server.js

En `server.js`, agregar el cron job usando `node-cron` (ya está importado):

```javascript
cron.schedule("0 9 * * *", async () => {
  // Todos los días a las 9 AM Caracas
  await fetch("http://localhost:3000/api/cron/check-ingresos-pendientes", {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
});
```

O ajustar la hora según preferencia (9 AM es muy temprano; 10 AM o 2 PM puede
ser mejor).

### 3. UI para el técnico

En el panel RMA interno del técnico (`app/[locale]/rma/casos/page.tsx`):

- Suscribirse al evento Socket.io `ingresos_pendientes_alerta`
- Mostrar un toast/banner cuando llega una alerta
- Toast: "Tienes {N} ingresos pendientes de despacho por más de 7 días"

### 4. Endpoint de consulta para el técnico

`GET /api/seguridad/ingresos-pendientes-mios?tecnico_id=X`

Devuelve los ingresos pendientes asignados a un técnico específico, para que
él pueda ver el detalle sin ir al módulo Seguridad.

### 5. Privacidad

Los técnicos solo deben ver SUS ingresos pendientes, no los de otros. El
endpoint filtra por `tecnico_id` del JWT.

## Criterio de aceptación

- El cron corre diariamente y emite alertas para técnicos con ingresos > 7d
- Si N8N está configurado, el técnico recibe WhatsApp/email
- Si el técnico tiene el panel abierto, ve un toast en tiempo real
- El endpoint `/ingresos-pendientes-mios` solo muestra SUS ingresos
- El Seguridad puede ver todos los ingresos pendientes desde su dashboard

## Estimación

- Endpoint cron: 2 horas (queries + emit + webhook)
- Server.js cron: 30 minutos
- Toast en panel RMA: 2 horas (Socket.io subscription + UI)
- Endpoint de consulta: 1 hora
- Tests (cron + notificación): 1 hora
- **Total: ~6-7 horas**

## Consideraciones

- **Frecuencia del cron**: diario es suficiente. Si se necesita más
  frecuencia, se puede correr cada 4 horas, pero cuidado con el spam al
  técnico.
- **Threshold**: 7 días es arbitrario. Configurable via `.env`:
  `SEGURIDAD_ALERTA_THRESHOLD_DAYS=7`
- **Auto-resolve**: si un ingreso se despacha, no debería volver a alertar.
  Esto funciona naturalmente porque el cron busca ingresos SIN despacho
  vinculado.