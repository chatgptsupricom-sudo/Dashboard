# [Seguridad Mejora 5/6] Vista móvil dedicada para el mostrador del almacén

## Contexto

El dashboard y los formularios actuales están optimizados para desktop. Pero
en la práctica, el personal de almacén usa el **teléfono** en el mostrador:
reciben al cliente, toman foto del equipo, llenan el formulario rápido y se
van.

Necesitamos una vista mobile-first que cargue rápido, tenga botones grandes
(touch-friendly), cámara integrada, y que NO tenga el sidebar del desktop.

## Lo que hay que hacer

### 1. Ruta dedicada

Crear `app/[locale]/seguridad/mostrador/page.tsx`:

- Ruta `/seguridad/mostrador` (distinta del dashboard principal)
- Mobile-first: diseño pensado para 375px de ancho
- Botones grandes (mínimo 48x48px para touch)
- Sin sidebar ni header pesado

### 2. Pantalla principal del mostrador

Layout:

```
┌─────────────────────────┐
│  📦 Seguridad Mostrador  │
├─────────────────────────┤
│                          │
│  ¿Qué quieres hacer?      │
│                          │
│  [📥 Nuevo Ingreso       │
│       (botón primario)]   │
│                          │
│  [📤 Nuevo Despacho      │
│       (botón outline)]    │
│                          │
│  [📋 Ver Pendientes       │
│       (count badge)]       │
│                          │
│  [🔍 Buscar               │
│       por ticket]         │
│                          │
│  ─────────────────────   │
│  📅 Hoy                  │
│  Ingresos: 5  Desp: 3   │
│                          │
│  [👤 Mi cuenta / logout]  │
└─────────────────────────┘
```

### 3. Flujo de "Nuevo Ingreso" mobile-first

Versión simplificada del formulario actual (`/seguridad/ingreso/nuevo`):

- Solo los campos críticos visibles inmediatamente:
  - Botón grande "Buscar ticket" (abre el modal de búsqueda por case_number)
  - Si ticket encontrado, pre-llena
  - Botón "Sin ticket" para llenar manualmente
- 4 checks como toggle buttons grandes (Sí / No en colores)
- Cámara integrada (issue #2) directamente accesible
- Botón "Registrar" sticky en la parte inferior

### 4. Flujo de "Buscar ticket"

Modal fullscreen en mobile:

- Input grande "Número de ticket (ej: 0042)"
- Botón "Buscar"
- Resultado muestra: case_number, cliente, hardware, serial, falla, fotos adjuntas
- Botón "Usar este ticket" → pre-llena el formulario
- Botón "Cancelar"

### 5. Flujo de "Ver Pendientes"

Lista compacta de ingresos sin despacho, optimizada para mobile:

- Card por ingreso: cliente, hardware, días en taller (badge de color: verde <7d, amber 7-14d, rojo >14d)
- Click → abre el detalle del ingreso
- Botón flotante "Nuevo Ingreso" en la parte inferior

### 6. Vista del despacho mobile-first

Similar simplificación para el formulario de despacho:

- Solo los campos críticos
- Cámara + firma digital integradas (issues #1 y #2)
- Botón "Registrar despacho" sticky

### 7. Detección automática de mobile

El layout actual detecta mobile via CSS (`sm:`, `md:`). Pero el dashboard
del mostrador debe ser SIEMPRE mobile, independiente del dispositivo. No
debe haber switch "modo desktop" — el mostrador es mobile por definición.

## Criterio de aceptación

- La ruta `/seguridad/mostrador` carga rápido (<1s en 4G)
- Botones son touch-friendly (mínimo 48x48px)
- La cámara del teléfono se puede usar desde el formulario
- El formulario es mínimo: solo campos esenciales visibles
- Si el Seguridad necesita ver el dashboard completo, va a `/seguridad`
  (sin redirección automática — el dashboard principal sigue existiendo)
- Funciona offline (al menos los datos del día cargados)

## Estimación

- Página principal del mostrador: 2 horas
- Flujo "Nuevo Ingreso" simplificado: 2 horas
- Flujo "Buscar ticket" modal: 1 hora
- Flujo "Ver Pendientes": 1 hora
- Vista del despacho simplificada: 2 horas
- Tests en distintos móviles: 2 horas
- **Total: ~10 horas**

## Performance

- Service Worker para cachear la página principal
- Los datos del día en `localStorage` para ver sin conexión
- Sync cuando vuelve la conexión (la creación de ingresos ya funciona con
  fetch normal, solo hay que hacer la cola de sync)

Si el performance es crítico, se puede hacer con React Native o PWA
instalable. Por ahora, web responsive es suficiente.