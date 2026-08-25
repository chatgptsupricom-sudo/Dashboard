# [Seguridad Mejora 2/6] Upload de fotos del estado del equipo al recibir

## Contexto

Cuando el cliente entrega un equipo, el Seguridad toma una foto del estado
físico del producto (rayones, golpes, accesorios incluidos, etc.). Esta foto
queda como evidencia antes de que el técnico abra el equipo. Si después el
cliente reclama "yo lo entregué en perfecto estado", tenemos la foto como
prueba.

El campo `foto_estado_url` ya existe en `seguridad_ingresos` (issue #30).
Falta el endpoint de upload y la UI en el formulario de ingreso.

## Lo que hay que hacer

### 1. UI en el formulario de ingreso

En `app/[locale]/seguridad/despacho/nuevo/page.tsx` (en realidad es
`/seguridad/ingreso/nuevo/page.tsx`):

- Agregar un campo "Foto del estado del equipo (opcional)" en la sección de
  datos del ingreso
- Dos modos de carga:
  - **Tomar foto** (mobile): botón "Tomar foto" que abre la cámara del
    dispositivo (`<input type="file" accept="image/*" capture="environment">`)
  - **Subir archivo** (desktop): botón "Elegir archivo" con drag & drop
- Preview de la foto antes de enviar
- Botón "Quitar" para borrar la foto seleccionada

### 2. Endpoint de upload

`POST /api/seguridad/ingreso/[id]/foto`

- Recibe `multipart/form-data` con un campo `foto` (archivo)
- Valida:
  - Tipo MIME: `image/jpeg`, `image/png`, `image/webp`, `image/heic`
  - Tamaño: max 10 MB
- Convierte a buffer y guarda en `seguridad_ingresos.foto_estado_url` (como
  LONGBLOB o data URL — elegir según decisión de infra)
- Retorna `{ success: true, foto_url: string }`

### 3. Endpoint de serving

`GET /api/seguridad/ingreso/[id]/foto`

- Auth required (solo Seguridad y SuperAdmin)
- Devuelve la imagen con `Content-Type` correcto
- Cache-Control: private, max-age=86400

### 4. UI en el detalle del ingreso

En `app/[locale]/seguridad/ingreso/[id]/page.tsx`:

- Si hay `foto_estado_url`, mostrar thumbnail en el detalle
- Click abre lightbox para ver la foto completa

### 5. Múltiples fotos (decisión)

Por ahora un ingreso = una foto. Si se necesitan múltiples (una del
producto, una de los accesorios, una de la falla), se puede hacer después
con una tabla `seguridad_ingreso_fotos` (1:N). Para el MVP, una sola foto
es suficiente.

## Criterio de aceptación

- El Seguridad puede tomar foto con el teléfono desde el formulario de ingreso
- El Seguridad puede subir foto desde desktop con drag & drop
- La foto se guarda asociada al ingreso
- La foto se muestra en el detalle del ingreso
- Si no hay foto, el flujo sigue funcionando
- Validación de tipo MIME y tamaño funciona (rechaza .exe o > 10MB)

## Estimación

- UI en formulario: 1-2 horas (cámara + drag&drop)
- Endpoint POST: 1 hora (similar a `rma_ticket_adjuntos`)
- Endpoint GET: 30 minutos
- Mostrar en detalle: 30 minutos
- Tests manuales (móvil + desktop): 1 hora
- **Total: ~4-5 horas**