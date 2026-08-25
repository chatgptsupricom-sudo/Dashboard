# Plan del Rol "Seguridad" — 5 issues

Este directorio contiene la propuesta completa para el **nuevo rol "Seguridad"** de
Supricom/OSC, completamente separado del panel principal (igual que el portal
público de Servicio Técnico vive en `/servicio-tecnico` y no en `/dashboard`).

## Contexto

El equipo de Seguridad/Almacén de OSC es responsable de:

1. **Ingreso del equipo al taller** — cuando un cliente entrega un producto
   para reparación, el Seguridad registra la recepción: fecha, factura,
   cliente, hardware, número de serie, descripción de la falla, accesorios
   íntegros / sin manipulación / dentro de la fecha / falla cubierta por
   garantía.
2. **Egreso del equipo despachado** — cuando el técnico devuelve el equipo
   reparado, el Seguridad registra el despacho: nombre del almacenista que
   lo entrega, facturas incluidas en el despacho, fecha.
3. **Calificar al almacenista** — el técnico (o el cliente) puede dar 1 a 5
   estrellas al almacenista según el trato y la condición del equipo al
   momento de recibirlo.

La planilla física existente (RECEPCIÓN Y DESPACHO DE RMA — ver imagen
adjunta en el chat) define el flujo en papel. Este plan lo digitaliza.

## Issues

Los issues están numerados para crear en GitHub con la etiqueta `rol-seguridad`.

| # | Issue | Depende de |
|---|---|---|
| 1 | [Base: ruta, layout y middleware](./01-base-rol-seguridad.md) | — |
| 2 | [Recepción de equipo (ingreso al taller)](./02-recepcion-equipo.md) | #1 |
| 3 | [Despacho de mercancía (egreso del taller)](./03-despacho-mercancia.md) | #1 |
| 4 | [Sistema de calificación 1-5 estrellas del almacenista](./04-calificacion-almacenista.md) | #1, #2, #3 |
| 5 | [Dashboard del Seguridad con KPIs](./05-dashboard-seguridad.md) | #1, #2, #3, #4 |

## Resumen del flujo

```
┌──────────────────────────────────────────────────────────────┐
│  Cliente reporta falla desde supricom.com.ve (issue #18-26)  │
│  → ticket cae en rma_cases con origen='portal'              │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────┐
│  Técnico de OSC procesa el ticket (panel RMA interno)        │
│  → diagnostica, repara o emite nota de crédito              │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────┐
│  ╔══════════════════════════════════════════════════════════╗ │
│  ║  SEGURIDAD (rol nuevo, ruta separada /seguridad)       ║ │
│  ╠══════════════════════════════════════════════════════════╣ │
│  ║                                                          ║ │
│  ║  1. Recepción (ingreso)                                 ║ │
│  ║     - Cuando el cliente entrega el equipo               ║ │
│  ║     - Registra: fecha, factura, accesorios, garantía    ║ │
│  ║     - Toma foto del estado del equipo                   ║ │
│  ║     - Califica al cliente/entrega (1-5)                 ║ │
│  ║                                                          ║ │
│  ║  2. Despacho (egreso)                                   ║ │
│  ║     - Cuando el técnico devuelve el equipo reparado     ║ │
│  ║     - Registra: nombre del almacenista, facturas       ║ │
│  ║     - Confirma accesorios y firma de recibido           ║ │
│  ║     - Califica al almacenista (1-5)                     ║ │
│  ║                                                          ║ │
│  ╚══════════════════════════════════════════════════════════╝ │
└──────────────────────────────────────────────────────────────┘
```

## Decisiones pendientes

Antes de empezar a codear hay que definir:

1. **Nombre del rol en código** — el issue lo llama "Seguridad" pero el rol
   real puede ser Almacén, Control de Acceso, Recepción, etc. Confirmar con
   el equipo.
2. **Quién califica al almacenista** — el técnico, el cliente, o ambos.
   Definir para el issue #4.
3. **Integración con el ticket del portal** — ¿el ingreso se asocia
   automáticamente al ticket del portal, o es manual?
4. **Política de datos** — el Seguridad no debe ver montos ni facturas
   completas (solo el número para rastreo). ¿Hasta dónde llega?

## Cómo crear los issues en GitHub

Estos archivos están listos para copiar y pegar en GitHub Issues. La forma mas
rapida es `gh` CLI (no instalado aca):

```bash
gh issue create \
  --label "enhancement" \
  --label "rol-seguridad" \
  --title "[Seguridad] 1/5: Rol Seguridad separado - ruta, layout, middleware y diseno base" \
  --body-file docs/issues/seguridad/01-base-rol-seguridad.md
```

O pegar manualmente desde la UI web de GitHub.