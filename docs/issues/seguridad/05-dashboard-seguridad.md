# [Seguridad] 5/5: Dashboard del Seguridad con KPIs y reportes

## Contexto

El Seguridad abre la app, ve el panel principal y dice "¿qué hago hoy?". El
dashboard debe responder esa pregunta en 5 segundos: ingresos pendientes de
evaluar por el técnico, despachos pendientes de retirar por el cliente,
promedio de estrellas del equipo de almacén, alertas operativas.

Es el "cockpit" del módulo Seguridad — un módulo que es 100% operativo, no
ejecutivo. La estética debe ser más funcional que decorativa: tablas
densas, números grandes, acceso directo a las acciones.

## Depende de

- #1 (Base)
- #2 (Recepción) — KPIs de ingresos
- #3 (Despacho) — KPIs de despachos
- #4 (Calificación) — KPIs de almacenistas

## Lo que hay que hacer

### 1. Pantalla principal del dashboard

`app/[locale]/seguridad/page.tsx` (la `/seguridad` raíz)

Estructura sugerida (orden arriba → abajo):

#### KPIs principales (4 tarjetas grandes)

```
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ Ingresos hoy     │ │ Despachos hoy    │ │ En taller > 7d   │ │ Promedio ★        │
│      12          │ │       8          │ │       3          │ │     4.6          │
│ ↑ 2 vs ayer      │ │ ↓ 1 vs ayer      │ │ ⚠ revisar        │ │ 47 calificaciones│
└──────────────────┘ └──────────────────┘ └──────────────────┘ └──────────────────┘
```

- **Ingresos hoy**: total de ingresos del día, comparativa con ayer
- **Despachos hoy**: total de despachos del día, comparativa con ayer
- **En taller > 7d**: ingresos sin despacho vinculado con más de 7 días
  (alerta visual, el Seguridad debe avisar al técnico)
- **Promedio ★**: promedio de estrellas del equipo de almacén, total de
  calificaciones del mes

#### Cola de ingresos pendientes

Tabla con los últimos ingresos del día, click → detalle. Columnas:

- Hora
- Cliente
- Hardware / Serie
- 4 checks (badges verde/rojo)
- Recibido por
- ¿Despachado? (badge)

Filtro rápido: "solo pendientes de despacho", "solo con garantía denegada",
"solo de hoy".

#### Cola de despachos pendientes

Igual que ingresos, pero con:

- Hora
- Cliente que retira
- Almacenista
- Facturas (count)
- Estado (despachado / pendiente)

#### Top almacenistas del mes

Tabla con:

- Nombre del almacenista
- Ingresos este mes
- Despachos este mes
- Promedio ★
- # calificaciones

Ordenado por promedio ★ descendente. Esto es la "liga" interna — buena
motivación para el equipo.

#### Alertas

- "3 ingresos de más de 7 días sin despacho" (click → listado filtrado)
- "5 ingresos de los últimos 30 días con garantía denegada" (posible fraude
  o falla sistémica)
- "Almacenista X tiene promedio < 3" (atención de RRHH)

### 2. Endpoints

`GET /api/seguridad/dashboard`

```json
{
  "kpis": {
    "ingresos_hoy": 12,
    "ingresos_hoy_delta": 2,
    "despachos_hoy": 8,
    "despachos_hoy_delta": -1,
    "en_taller_mas_7d": 3,
    "promedio_calificacion": 4.6,
    "total_calificaciones_mes": 47
  },
  "ingresos_recientes": [...],
  "despachos_recientes": [...],
  "top_almacenistas": [
    { "nombre": "Pedro Ramirez", "ingresos_mes": 45, "despachos_mes": 42, "promedio": 4.9, "calificaciones": 38 },
    ...
  ],
  "alertas": [
    { "tipo": "ingresos_sin_despacho", "cantidad": 3, "dias":": 7, "severidad": "warning" },
    ...
  ]
}
```

Cacheable por 5 minutos. Si se necesita tiempo real, agregar websocket
después.

### 3. Reportes exportables

Botón "Exportar Excel" en cada una de las tablas del dashboard. Reutilizar el
patrón de `app/api/superadmin/integraciondepago/route.ts` (exceljs).

### 4. Página de detalle por almacenista

`app/[locale]/seguridad/almacenista/[nombre]/page.tsx`

- Promedio histórico
- Gráfico de barras: calificaciones por mes
- Lista de los últimos 50 comentarios (con quién, cuándo, ingreso/despacho)
- Filtros: rango de fechas

### 5. Aislamiento

El dashboard **NO** es accesible desde el sidebar del panel principal. Solo
desde `/seguridad`. Si en el futuro necesitan ver algo desde el panel, se
hace vía API.

### 6. Diseño

- Mismo morado `#741DFE`, Manrope 600, radio 10px
- Tablas densas pero legibles (filas de 48px, padding generoso)
- KPIs con números grandes (text-4xl) y label pequeño (text-xs uppercase)
- Alertas en amber (`bg-amber-50`) o red (`bg-red-50`) según severidad
- Mobile: el dashboard se simplifica a KPIs + listas, el detalle de
  almacenista se puede quedar desktop-only (el Seguridad usa móvil en el
  almacén pero la consulta de stats se hace en desktop)

## Criterio de aceptación

- `/es/seguridad` (raíz) muestra los 4 KPIs principales
- El delta de ingresos/despachos vs ayer está calculado correctamente
- La tabla de "En taller > 7d" muestra los ingresos pendientes de despacho
- La tabla de top almacenistas se ordena por promedio ★
- El endpoint `/api/seguridad/dashboard` responde en menos de 500ms con 1000
  ingresos en la base
- Los reportes se exportan a Excel sin perder formato (acentos, etc.)
- El dashboard NO aparece en el sidebar del panel principal
- Las alertas aparecen como notificaciones visuales cuando superan
  thresholds configurables (ej: > 3 ingresos pendientes)