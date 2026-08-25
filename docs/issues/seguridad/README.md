# Plan del Rol "Seguridad" — Issues iniciales + Mejoras

Este directorio contiene la propuesta completa para el **nuevo rol "Seguridad"** de
Supricom/OSC, completamente separado del panel principal (igual que el portal
público de Servicio Técnico vive en `/servicio-tecnico` y no en `/dashboard`).

## Estado actual

Los 5 issues del MVP ya están **implementados y mergeados** en la rama `seguridad`:

| # | Issue | Estado | Commit |
|---|---|---|---|
| 1 | [Base: ruta, layout y middleware](./01-base-rol-seguridad.md) | ✅ | `3d3a925` |
| 2 | [Recepción de equipo (ingreso al taller)](./02-recepcion-equipo.md) | ✅ | `c2831c2` |
| 3 | [Despacho de mercancía (egreso del taller)](./03-despacho-mercancia.md) | ✅ | `b3358e3` |
| 4 | [Sistema de calificación 1-5 estrellas del almacenista](./04-calificacion-almacenista.md) | ✅ | `bc0aebe` |
| 5 | [Dashboard del Seguridad con KPIs](./05-dashboard-seguridad.md) | ✅ | `dd3e73d` |

El módulo cubre el flujo completo end-to-end: ingreso → despacho → calificación → KPIs.

## Mejoras (issues adicionales)

Estos son issues para **después** del MVP. No son bloqueantes pero suman valor:

| # | Issue | Estimación |
|---|---|---|
| 1 | [Firma digital real del cliente en el despacho](./mejora-01-firma-digital.md) | ~6-7h |
| 2 | [Upload de fotos del estado del equipo al recibir](./mejora-02-foto-estado.md) | ~4-5h |
| 3 | [Notificaciones al técnico cuando hay ingresos pendientes](./mejora-03-notificaciones-tecnico.md) | ~6-7h |
| 4 | [Export a Excel de los listados de ingresos y despachos](./mejora-04-export-excel.md) | ~5h |
| 5 | [Vista móvil dedicada para el mostrador del almacén](./mejora-05-vista-mostrador.md) | ~10h |
| 6 | [Vinculación automática ingresos ↔ tickets del portal](./mejora-06-vinculacion-automatica.md) | ~7-8h |

**Total mejoras**: ~38-42 horas de desarrollo.

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
│  ║  1. Recepción (ingreso) ✅                              ║ │
│  ║     - Cuando el cliente entrega el equipo               ║ │
│  ║     - Registra: fecha, factura, accesorios, garantía    ║ │
│  ║     - 🔲 Foto del estado (mejora #2)                   ║ │
│  ║     - Califica al cliente/entrega (1-5) ✅              ║ │
│  ║                                                          ║ │
│  ║  2. Despacho (egreso) ✅                                ║ │
│  ║     - Cuando el técnico devuelve el equipo reparado     ║ │
│  ║     - Registra: nombre del almacenista, facturas       ║ │
│  ║     - Confirma accesorios y firma de recibido           ║ │
│  ║     - 🔲 Firma digital (mejora #1)                     ║ │
│  ║     - Califica al almacenista (1-5) ✅                  ║ │
│  ║                                                          ║ │
│  ║  3. Calificación ✅                                     ║ │
│  ║     - Técnico y/o cliente califican al almacenista        ║ │
│  ║                                                          ║ │
│  ║  4. Dashboard con KPIs ✅                               ║ │
│  ║     - Ingresos hoy, despachos hoy, taller > 7d, ★      ║ │
│  ║     - 🔲 Notificaciones push (mejora #3)                ║ │
│  ║     - 🔲 Export a Excel (mejora #4)                     ║ │
│  ║     - 🔲 Vista móvil dedicada (mejora #5)               ║ │
│  ║                                                          ║ │
│  ╚══════════════════════════════════════════════════════════╝ │
└──────────────────────────────────────────────────────────────┘
```

## Decisiones pendientes (de los issues iniciales)

1. **Nombre del rol en código** — el issue lo llama "Seguridad" pero el rol
   real puede ser Almacén, Control de Acceso, o Recepción. **Decidir con el equipo.**
2. **Quién califica al almacenista** — el técnico, el cliente, o ambos.
   **Recomendación: ambos** (técnico evalúa la recepción, cliente evalúa la entrega).
3. **Política de datos** — el Seguridad no debe ver montos ni facturas
   completas (solo el número para rastreo). **Resuelto: implementado así.**
4. **Integración con el ticket del portal** — **Resuelto en mejora #6** (notificación
   proactiva al Seguridad).

## Cómo crear issues en GitHub

Estos archivos están listos para copiar y pegar en GitHub Issues. La forma más
rápida es `gh` CLI (no instalado acá):

```bash
gh issue create \
  --label "enhancement" \
  --label "rol-seguridad" \
  --title "[Seguridad Mejora 1/6] Firma digital real del cliente en el despacho" \
  --body-file docs/issues/seguridad/mejora-01-firma-digital.md
```

O pegar manualmente desde la UI web de GitHub.

## Resumen ejecutivo

- ✅ **MVP funcional**: el rol Seguridad está operativo end-to-end
- 📋 **6 mejoras pendientes** que se pueden priorizar según necesidad
- 🎯 **Impacto principal**: cerrar el ciclo cliente → ticket → almacén → despacho
  con notificaciones en tiempo real (mejoras #1, #2, #6) y herramientas de
  gestión (mejoras #3, #4, #5)
- ⏱️ **Estimación total mejoras**: ~1 semana de trabajo (38-42 horas)