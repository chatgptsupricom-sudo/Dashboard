/**
 * Lectura y escritura del stock POP sobre la conexión de una transacción.
 *
 * Vive aparte porque lo usan dos flujos: los movimientos que registra el
 * adminLeads a mano y la entrega de una solicitud de un vendedor. Tener dos
 * copias de esto es como termina un inventario descuadrado.
 */

/** Suma o resta el stock de una ubicación para un producto. */
export async function cambiarStock(
  conn: any,
  productId: number,
  location: string,
  delta: number,
): Promise<void> {
  await conn.execute(
    `INSERT INTO pop_stock (product_id, location, quantity)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)`,
    [productId, location, delta],
  );
}

/** Stock actual de un producto en una ubicación, con la fila bloqueada. */
export async function leerStock(
  conn: any,
  productId: number,
  location: string,
): Promise<number> {
  const [rows] = await conn.execute(
    "SELECT quantity FROM pop_stock WHERE product_id = ? AND location = ? FOR UPDATE",
    [productId, location],
  );
  if (rows.length === 0) return 0;
  return Number(rows[0].quantity) || 0;
}
