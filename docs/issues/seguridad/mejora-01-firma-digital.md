# [Seguridad Mejora 1/6] Firma digital real del cliente en el despacho

## Contexto

En el issue #3 (Despacho) dejamos la firma del cliente como un simple input de
texto (`cliente_retira`). Eso es un placeholder: el cliente debería firmar en
pantalla con el dedo o el mouse, y la firma debería guardarse como imagen
para imprimirla en el comprobante.

El campo `firma_url` ya existe en la tabla `seguridad_despachos`. Falta la UI
para capturarla y el endpoint para subirla.

## Lo que hay que hacer

### 1. Componente de firma

Crear `components/seguridad/SignaturePad.tsx`:

- Canvas HTML5 con `width="400" height="150"` (relación 8:3, buena para firmas)
- Soporte para mouse y touch (Pointer Events API para unificar)
- Botón "Limpiar" que borra el canvas
- Botón "Guardar" que convierte el canvas a data URL (base64 PNG) y llama al callback `onSave(dataUrl: string)`
- Línea de base horizontal con etiqueta "X" para que el cliente sepa dónde firmar
- Estilo consistente con el módulo: borde redondeado, fondo blanco, botón violeta

### 2. Endpoint de upload de firma

`POST /api/seguridad/despacho/[id]/firma`

- Recibe body JSON: `{ firma_data_url: string }`
- Valida que el despacho existe y pertenece al Seguridad logueado
- Convierte el data URL a buffer (extraer el base64)
- Guarda en MySQL en `seguridad_despachos.firma_url` (el campo ya existe, pero ahora guarda el data URL directo por simplicidad — o se podría subir a un bucket si Supricom tiene uno configurado)
- Retorna `{ success: true, firma_url: string }`

**Decisión**: ¿guardar el data URL en MySQL o subir a un bucket? El data URL de una firma pequeña (~10KB PNG) es razonable para MySQL. Pero si Supricom tiene un bucket S3/GCS configurado, mejor ahí. **Confirmar con el equipo de infra cuál opción prefiere**.

Por simplicidad: empezar con MySQL LONGBLOB (similar a `rma_ticket_adjuntos`).

### 3. UI en el formulario de despacho

En `app/[locale]/seguridad/despacho/nuevo/page.tsx`:

- Reemplazar el input "Firma del cliente" placeholder por el componente `SignaturePad`
- Al enviar el formulario, si hay firma, hacer POST a `/api/seguridad/despacho/[newId]/firma` después de crear el despacho
- Si no hay firma, el envío sigue siendo válido (firma opcional)

### 4. UI en el comprobante imprimible

En el comprobante HTML que ya existe (`api/seguridad/despacho/[id]/comprobante/route.ts`):

- Si hay `firma_url`, mostrarla como imagen en el bloque "Firma del cliente"
- Si no hay, mostrar línea en blanco con etiqueta "_____________________"

### 5. Privacidad

La firma contiene datos personales (es la firma legal del cliente). Considerar:
- Encriptar en MySQL (no es trivial, requiere `AES_ENCRYPT` con una key)
- O guardar el archivo en storage cifrado

**Por ahora**: dejar en MySQL plano (LONGBLOB) con un comment en el código que diga que se debería encriptar en producción. La encriptación es un follow-up.

### 6. Endpoint de serving

`GET /api/seguridad/despacho/[id]/firma`

- Auth required (solo Seguridad y SuperAdmin)
- Devuelve la imagen PNG con `Content-Type: image/png`
- Cache-Control: private, max-age=86400 (24h, las firmas no cambian)

## Criterio de aceptación

- El cliente puede firmar con mouse en desktop y con dedo en mobile
- La firma se guarda asociada al despacho
- El comprobante imprimible muestra la firma si existe
- Si no hay firma, el comprobante funciona igual (línea en blanco)
- La firma se sirve autenticada (no es URL pública)
- Funciona en mobile (touch) y desktop (mouse)

## Estimación

- Componente SignaturePad: 2-3 horas
- Endpoint POST: 1 hora
- Endpoint GET: 30 minutos
- Integración en formulario de despacho: 1 hora
- Actualización del comprobante: 30 minutos
- Tests manuales (firma en touch): 1 hora
- **Total: ~6-7 horas**