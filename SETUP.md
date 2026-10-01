# SUPRICOM - Panel Administrativo Setup Guide

## Descripción General

Panel administrativo multicapa para SUPRICOM con login premium animado, autenticación Odoo, gestión de roles y auditoría completa.

## Características Implementadas

### ✅ Completadas
1. **Login Premium Animado**
   - Dos efectos de fondo intercambiables (curvas fluidas + geometría 3D)
   - Diseño basado en LOGIN VERSION 4 (minimalista y elegante)
   - Soporte multiidioma (Español e Inglés) dinámico
   - Animaciones suaves con Framer Motion
   - Logo SUPRICOM corporativo

2. **Estructura del Proyecto**
   - Next.js 15 con TypeScript
   - Tailwind CSS para estilos
   - Zustand para state management (autenticación e idioma)
   - Axios para HTTP requests
   - JWT para sesiones seguras

3. **Sistema de Tipos y Permisos**
   - 6 roles definidos: Presidencia, GerenciaMarca, Mercadeo, GerenciaMarketing, Programadores, Auditoria
   - Permisos granulares por rol
   - Sistema de auditoría integrado

## Configuración Requerida

### 1. Variables de Entorno (.env.local)

```env
# Odoo Configuration
NEXT_PUBLIC_ODOO_URL=http://localhost:8069
ODOO_DB=odoo
ODOO_API_KEY=your_api_key_here

# JWT Configuration
JWT_SECRET=your-super-secret-key-change-in-production
JWT_EXPIRATION=7d
```

### 2. Conexión con Odoo

Para que la autenticación funcione:

1. **Crear API Key en Odoo:**
   - Ir a Configuración > Usuarios
   - Seleccionar un usuario técnico
   - Crear una API Key (token)
   - Copiar el token a `ODOO_API_KEY`

2. **Modelos Requeridos en Odoo:**
   - `res.users` - Usuarios (estándar)
   - `res.groups` - Grupos/Roles (estándar)
   - `audit.log` - Modelo personalizado para auditoría:

```python
from odoo import models, fields

class AuditLog(models.Model):
    _name = 'audit.log'
    
    user_id = fields.Many2one('res.users', string='Usuario')
    action = fields.Char(string='Acción')
    resource = fields.Char(string='Recurso')
    old_values = fields.Json(string='Valores Anteriores')
    new_values = fields.Json(string='Valores Nuevos')
    status = fields.Selection([('success', 'Exitoso'), ('failed', 'Fallido')])
    timestamp = fields.Datetime(string='Fecha/Hora')
```

### 3. Mapeo de Roles Odoo

Actualmente, el sistema mapea usuarios basado en su email. Para mapear correctamente:

Editar `/app/api/auth/login/route.ts` línea 20-28:

```typescript
// Mapeo automático basado en email o grupo
if (odooUser.email.includes('presidencia')) {
  role = UserRole.PRESIDENCY;
} else if (odooUser.email.includes('gerencia_marca')) {
  role = UserRole.BRAND_MANAGEMENT;
}
// Añadir más condiciones según sea necesario
```

O implementar un sistema de grupos en Odoo y leerlo desde `role_ids`.

## Rutas Disponibles

### Autenticación
- `POST /api/auth/login` - Iniciar sesión (requiere email y password)
- `GET /api/auth/verify` - Verificar token JWT válido

### Frontend
- `/login` - Página de login animada
- `/dashboard` - Dashboard principal (requiere autenticación)
- `/dashboard/users` - Gestión de usuarios (requiere permisos)
- `/dashboard/audit` - Log de auditoría (requiere permisos)

## Próximos Pasos

1. **Configurar Odoo:**
   - Instalar módulo de auditoría
   - Crear API Key
   - Definir usuarios con roles

2. **Implementar Dashboards:**
   - Dashboard de Presidencia (vista general)
   - Dashboard de Marca (ventas, mapa, calendario)
   - Dashboard de Mercadeo (reportes por zona)

3. **Completar Gestión de Usuarios:**
   - CRUD de usuarios (solo para Programadores)
   - Validación de contraseñas
   - Historial de cambios

4. **Seguridad:**
   - Implementar HTTPS en producción
   - Usar `JWT_SECRET` segura
   - Configurar CORS si es necesario

## Estructura de Archivos

```
/app
  /api
    /auth
      /login/route.ts
      /verify/route.ts
  /[locale]
    /page.tsx (redirección a login)
    /login/page.tsx (página de login)
    /dashboard/
      /page.tsx (dashboard principal)
      /users/page.tsx
      /audit/page.tsx

/components
  /auth
    /login-form.tsx
    /login-page.tsx
    /animated-background.tsx
    /language-switcher.tsx
  /dashboard
    /dashboard-layout.tsx
    /sidebar.tsx
    /top-bar.tsx
    /dashboard-content.tsx

/lib
  /types.ts (tipos de roles y usuarios)
  /odoo.ts (funciones RPC de Odoo)
  /jwt.ts (generación y verificación de JWT)
  /stores
    /auth.store.ts (estado de autenticación)
    /language.store.ts (estado de idioma)

/messages
  /es.json (traducciones español)
  /en.json (traducciones inglés)
```

## Colores Corporativos

Basados en tu paleta:
- **Azul Marino Profundo:** #001C49
- **Azul Real Brillante:** #1E6EFD
- **Azul Cian Pálido:** #87CFFF
- **Blanco Puro:** #FFFFFF
- **Gris Claro Sutil:** #F2F2F2
- **Gris de Sombra Media:** #C0C0C0

## Testing

Para probar el login:
1. Asegúrate de que Odoo está corriendo en `NEXT_PUBLIC_ODOO_URL`
2. Crea un usuario en Odoo con un email y contraseña
3. Navega a `http://localhost:3000/login`
4. Ingresa las credenciales
5. Si todo funciona, serás redirigido al dashboard

## Troubleshooting

### "Couldn't find next-intl config file"
- Asegurate de que `proxy.ts` existe (no middleware.ts)
- Los archivos de idioma están en `/messages`

### Error de conexión a Odoo
- Verifica que `NEXT_PUBLIC_ODOO_URL` es accesible
- Confirma que `ODOO_API_KEY` es válida
- Revisa los logs del servidor Odoo

### Token inválido/expirado
- El JWT expira en 7 días (configurable)
- Las cookies se limpian al logout
- El token se almacena en localStorage (Zustand persist)
