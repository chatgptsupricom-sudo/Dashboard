# [Seguridad Mejora 4/6] Export a Excel de los listados de ingresos y despachos

## Contexto

Los listados de ingresos y despachos (`/seguridad/ingreso` y
`/seguridad/despacho`) muestran los datos en pantalla pero no hay forma de
exportarlos a Excel. Para reporting mensual o para enviarle al equipo
contable, los usuarios necesitan descargar los datos en un archivo editable.

El repo ya tiene el patrón en `app/api/superadmin/integraciondepago/route.ts`
que usa `exceljs` para generar el archivo. Vamos a seguir ese mismo patrón.

## Lo que hay que hacer

### 1. Endpoint de export

`GET /api/seguridad/ingreso/exportar`

- Query params aceptados (mismos filtros que el listado):
  - `search`
  - `desde` (fecha)
  - `hasta` (fecha)
  - `solo_pendientes`
- Devuelve un archivo Excel (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`)
- Headers en español (ya que el módulo Seguridad es en español por ahora)
- Columnas:
  - ID
  - Fecha de entrega
  - Cliente
  - Hardware
  - Serial
  - Factura
  - Descripción de falla
  - Accesorios íntegros (Sí/No)
  - Sin manipulación (Sí/No)
  - Dentro de la fecha (Sí/No)
  - Garantía (Sí/No)
  - Recibido por
  - RMA ticket vinculado
  - ¿Despachado? (Sí/No)
  - Calificación promedio (número)
  - Fecha de creación

`GET /api/seguridad/despacho/exportar`

- Mismos filtros
- Columnas:
  - ID
  - Fecha de despacho
  - Almacenista
  - Cliente que retira
  - Facturas (count + lista)
  - Accesorios íntegros
  - Observaciones
  - Ingreso vinculado
  - Tiene firma (Sí/No)
  - Calificación promedio
  - Fecha de creación

### 2. UI en los listados

En `app/[locale]/seguridad/ingreso/page.tsx`:

- Botón "Exportar Excel" en el header (al lado de "Nuevo ingreso")
- Icono: Download (lucide-react)
- Click → descarga el archivo directamente

En `app/[locale]/seguridad/despacho/page.tsx`:

- Mismo botón

### 3. Botón de export en el dashboard

En `app/[locale]/seguridad/page.tsx`, en las tablas de "Ingresos recientes"
y "Despachos recientes", agregar botón "Exportar todo" que descarga todos
los registros (no solo los 5 más recientes).

### 4. Estilo del Excel

- Primera fila con headers en negrita y fondo violeta (#741DFE) con texto blanco
- Filas alternadas con fondo gris claro para legibilidad
- Ancho de columnas ajustado al contenido
- Nombre del archivo: `ingresos_seguridad_2026-08-25.xlsx` (con fecha del
  día)
- Encoding UTF-8 con BOM para que Excel respete los acentos

### 5. Rango de fechas

Si no se pasan `desde` y `hasta`, exportar todo lo del último mes. Si se
pasan, usar esos límites.

## Criterio de aceptación

- Botón "Exportar Excel" funciona en ingresos y despachos
- El archivo se descarga con el nombre correcto
- Los acentos se ven bien en Excel (no salen rotos como Ã©)
- Los filtros del listado se respetan (si filtraste por fecha, se exporta solo eso)
- El archivo abre correctamente en Excel y LibreOffice
- El header tiene formato (negrita, color) para distinguirlo de los datos

## Estimación

- Endpoint ingresos: 1.5 horas (similar al de `integraciondepago`)
- Endpoint despachos: 1.5 horas
- Botones en listados: 30 minutos (cada uno)
- Botones en dashboard: 30 minutos
- Tests (abrir el archivo, verificar formato): 1 hora
- **Total: ~5 horas**

## Dependencias

Ya está instalado en el proyecto:
- `exceljs` (verificar en `package.json`)
- Si no está: `pnpm add exceljs`