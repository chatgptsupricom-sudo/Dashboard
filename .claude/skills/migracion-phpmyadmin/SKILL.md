---
name: migracion-phpmyadmin
description: Genera un script SQL de migración listo para correr a mano en el phpMyAdmin de EasyPanel (MySQL 9.7, base supricom_panel).
disable-model-invocation: true
argument-hint: "<descripción del cambio de esquema>"
---

# Migración para el phpMyAdmin de producción

Cambio pedido: $ARGUMENTS

Las migraciones se corren a mano en el phpMyAdmin de EasyPanel. Ese entorno
tiene restricciones que rompen los scripts "normales":

## Reglas

1. **Siempre `supricom_panel.tabla`**: sin la base delante, hasta un `CREATE TABLE` falla.
2. **Nada de `information_schema`** (`#1044 Acceso negado`). Nada de procedimientos que lo consulten.
3. MySQL no tiene `ADD COLUMN IF NOT EXISTS`: el script empieza con un bloque de **verificación previa** (`SHOW COLUMNS FROM supricom_panel.tabla;` / `SHOW TABLES FROM supricom_panel LIKE '...';`) comentado con qué debe verse antes de seguir.
4. Cambios en sentencias separadas y comentadas, sin transacciones que dependan de DDL (el DDL hace commit implícito).
5. Termina con un bloque de **verificación posterior** (`SHOW COLUMNS` / `SHOW TABLES` / `SELECT COUNT(*)`) y qué resultado esperar.
6. Si hay backfill de datos, `UPDATE` con `WHERE` explícito y un `SELECT` de control antes.

## Salida

- Archivo nuevo en `sql/<nombre_descriptivo>.sql` (snake_case, en español como los existentes).
- Ejemplos de referencia: `sql/egreso_por_etapas.sql`, `sql/recepcion_packing_list.sql`.
- Si el código usa la columna/tabla nueva, indicar qué archivos de `app/api/` o `lib/` hay que actualizar.
- Recordar al usuario: correr primero la verificación previa y pegar el resultado si algo no coincide.
