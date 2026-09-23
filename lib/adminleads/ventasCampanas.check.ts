// Chequeo de fechaISO. No hay suite de tests en el repo (ver CLAUDE.md); esto
// se corre a mano y falla ruidoso:
//
//   npx tsx lib/adminleads/ventasCampanas.check.ts
//
// Cubre el caso que rompio el reporte: mysql2 entrega los DATETIME como Date, y
// String(date).slice(0, 10) devolvia "Mon Sep 15" en vez de "2026-09-15".

import assert from "node:assert/strict";
import { fechaISO } from "./ventasCampanas";

// Date de mysql2 (mes 0-indexado: 8 = septiembre).
assert.equal(fechaISO(new Date(2026, 8, 15, 3, 30)), "2026-09-15");
// Madrugada: usar UTC habria devuelto el dia anterior en husos negativos.
assert.equal(fechaISO(new Date(2026, 0, 1, 0, 15)), "2026-01-01");
// Mes y dia de un solo digito van con cero a la izquierda.
assert.equal(fechaISO(new Date(2026, 2, 5)), "2026-03-05");

// Strings, por si la conexion corre con dateStrings activado.
assert.equal(fechaISO("2026-09-15 14:02:00"), "2026-09-15");
assert.equal(fechaISO("2026-09-15"), "2026-09-15");

// Vacios y basura no deben propagar texto a la columna Fecha.
assert.equal(fechaISO(null), "");
assert.equal(fechaISO(undefined), "");
assert.equal(fechaISO(""), "");
assert.equal(fechaISO("0000-00-00"), "0000-00-00"); // MySQL lo permite; se muestra tal cual
assert.equal(fechaISO(new Date("no es fecha")), "");
assert.equal(fechaISO("sin fecha"), "");

console.log("fechaISO OK");
