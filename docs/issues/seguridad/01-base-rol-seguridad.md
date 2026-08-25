# [Seguridad] 1/5: Rol Seguridad separado - ruta, layout, middleware y diseño base

## Contexto

Se necesita un **rol "Seguridad"** completamente separado del panel de Servicio
Técnico, igual que el portal público está en `/servicio-tecnico` y no en
`/dashboard`.

El Seguridad es responsable de:
- **Ingreso del equipo al taller**: registrar quién entrega, cuándo, en qué
  condición llega (accesorios, manipulación, garantía)
- **Egreso del equipo despachado**: registrar quién lo despacha (almacenista),
  qué facturas se incluyen, cuándo
- **Calificar al almacenista** de 1 a 5 estrellas

Este issue es solo el **esqueleto**: la ruta, el layout, el middleware y el
diseño. Los módulos funcionales van en issues separados (#2, #3, #4).

## La ruta pública

Igual que `/servicio-tecnico`, el rol Seguridad va en su propia ruta fuera del
dashboard:

```
/es/seguridad   (y /en/seguridad para el locale inglés)
```

NO usa el layout de `app/[locale]/dashboard/` ni el sidebar. Es una experiencia
aparte, solo para el equipo de Seguridad de OSC.

## Lo que hay que hacer

### 1. Rutas y layout propio

- `app/[locale]/seguridad/layout.tsx`: layout dedicado con su propio header (no
  el `DashboardLayout` del panel)
- `app/[locale]/seguridad/page.tsx`: dashboard básico del Seguridad (placeholder,
  lo completa el issue #5)
- `app/[locale]/seguridad/login/page.tsx`: login dedicado (puede ser compartido
  con `/login` del panel, pero con redirect a `/seguridad` después)

### 2. Middleware

`middleware.ts` actualmente solo protege rutas como `/dashboard`, `/superadmin`,
`/rma`, `/servicio-tecnico`, etc. Hay que agregar `/seguridad` como ruta
protegida con su propio rol.

**Nuevo rol en `lib/types.ts`**: agregar al enum `UserRole` el valor
correspondiente. El issue lo llama "Seguridad" pero el rol real puede ser
**Almacén**, **Control de Acceso**, o **Recepción**. **Confirmar con quien
maneja el equipo de almacen cuál es el nombre canónico.**

### 3. Permisos

- El Seguridad ve solo su módulo. No puede entrar al dashboard del vendedor,
  superadmin, ni al módulo RMA interno.
- No puede ver facturas ni montos. Solo ve los datos del equipo: cliente,
  hardware, serie, falla reportada.
- **Es el único rol que ve los adjuntos que subió el cliente** en el portal
  público (foto del producto, video de la falla) — porque es el que recibe
  físicamente el equipo y necesita verificar la condición.

### 4. Diseño

Mismo estilo que el portal público de servicio técnico:
- Morado `#741DFE`, tipografía Manrope 600, radio 10px
- Mobile-first (los almacenistas usan el teléfono en el almacén)
- Tema claro, pocos elementos decorativos — pantalla de captura de datos,
  no dashboard ejecutivo

### 5. Schema base

SQL con las tablas que va a usar este módulo (los detalles funcionales vienen
en los issues #2, #3, #4):

```sql
CREATE TABLE IF NOT EXISTS seguridad_ingresos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  rma_case_id INT DEFAULT NULL,
  -- ticket del portal o RMA interno
  fecha_entrega DAT: NOT NULL,
  factura_numero VARCHAR(100) DEFAULT NULL,
  -- solo el numero para rastreo, no el contenido
  cliente_nombre VARCHAR(200) NOT NULL,
  hardware VARCHAR(200) DEFAULT NULL,
  serial VARCHAR(200) DEFAULT NULL,
  descripcion_falla TEXT DEFAULT NULL,
  accesorios_integros TINYINT(1) DEFAULT 1,
  sin_manipulacion TINYINT(1) DEFAULT 1,
  dentro_de_fecha TINYINT(1) DEFAULT 1,
  falla_cubierta_garantia TINYINT(1) DEFAULT 0,
  recibido_por VARCHAR(200) NOT NULL,
  -- nombre del Seguridad que recibe
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS seguridad_despachos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  rma_case_id INT DEFAULT NULL,
  fecha_despacho DAT: NOT NULL,
  almacenista_nombre VARCHAR(200) NOT NULL,
  -- nombre de quien entrega
  facturas_incluidas TEXT DEFAULT NULL,
  -- JSON array de numeros de factura
  accesorios_integros TINYINT(1) DEFAULT 1,
  observaciones TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS seguridad_calificaciones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  almacenista_nombre VARCHAR(200) NOT NULL,
  calificacion TINYINT NOT NULL CHECK (calificacion BETWEEN 1 AND 5),
  -- 1 a 5 estrellas
  comentario TEXT DEFAULT NULL,
  relacionado_a ENUM('ingreso','despacho') NOT NULL,
  relacionado_id INT NOT NULL,
  calificado_por VARCHAR(200) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

Migración en `sql/seguridad.sql`. Los detalles de cada tabla se completan en
los issues #2, #3, #4.

### 6. Aislamiento del panel

El módulo Seguridad **no aparece en el sidebar del dashboard principal**. Es un
rol aparte, con su propio ingreso. Si en el futuro necesitan compartir algo,
será vía API, no UI.

## Criterio de aceptación

- `/es/seguridad` carga sin login y se queda en el login
- Después de autenticarse con el rol correcto, redirige a `/es/seguridad` (no
  al dashboard)
- El sidebar del dashboard NO muestra "Seguridad" como opción
- El nuevo rol está definido en el enum `UserRole` de `lib/types.ts`
- El middleware rechaza el acceso si el usuario no tiene el rol
- El estilo visual es consistente con el portal público de servicio técnico
- No hay endpoints públicos (todo requiere login)
- Las 3 tablas base existen en MySQL