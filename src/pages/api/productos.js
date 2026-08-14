// src/pages/api/productos.js
import { pool } from '../../lib/db.js';

export async function GET() {
  const [rows] = await pool.query(
    `SELECT p.id, p.name, p.precio, p.stock, c.name AS categoria, m.name AS marca
     FROM productos p
     JOIN categoria c ON p.id_cat = c.id
     JOIN marcas m ON p.id_mar = m.id
     WHERE p.disponible = 1 AND p.stock > 0`
  );
  return new Response(JSON.stringify(rows), {
    headers: { 'Content-Type': 'application/json' },
  });
}