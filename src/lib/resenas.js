// src/lib/resenas.js
import { pool } from './db.js';

const ESTADOS_VALIDOS = ['pendiente', 'aprobada', 'rechazada'];

function validarCalificacion(valor) {
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 1 || n > 5) {
    throw new Error('La calificación debe ser un número entero entre 1 y 5.');
  }
  return n;
}

function normalizarComentario(comentario) {
  if (comentario === undefined || comentario === null) return null;
  if (typeof comentario !== 'string') throw new Error('El comentario no es válido.');
  const limpio = comentario.trim();
  if (limpio.length > 600) throw new Error('El comentario no puede superar los 600 caracteres.');
  return limpio.length > 0 ? limpio : null;
}

/* ============================
   RESEÑAS DE PRODUCTOS
   ============================ */

/** Crea o actualiza (si ya existía) la reseña de un cliente para un producto. */
export async function guardarResenaProducto({ productoId, clienteId, calificacion, comentario }) {
  const id = Number(productoId);
  if (!Number.isInteger(id) || id <= 0) throw new Error('Producto inválido.');
  const cal = validarCalificacion(calificacion);
  const com = normalizarComentario(comentario);

  const [productos] = await pool.query('SELECT id FROM productos WHERE id = ?', [id]);
  if (productos.length === 0) throw new Error('El producto no existe.');

  await pool.query(
    `INSERT INTO resenas_productos (producto_id, cliente_id, calificacion, comentario, estado)
     VALUES (?, ?, ?, ?, 'pendiente')
     ON DUPLICATE KEY UPDATE calificacion = VALUES(calificacion), comentario = VALUES(comentario),
       estado = 'pendiente', created_at = CURRENT_TIMESTAMP`,
    [id, clienteId, cal, com]
  );
}

/** Resumen público (promedio y total) de un producto, solo reseñas aprobadas. */
export async function obtenerResumenProducto(productoId) {
  const [rows] = await pool.query(
    `SELECT ROUND(AVG(calificacion), 1) AS promedio, COUNT(*) AS total
     FROM resenas_productos WHERE producto_id = ? AND estado = 'aprobada'`,
    [productoId]
  );
  const fila = rows[0];
  return { promedio: fila.promedio ? Number(fila.promedio) : 0, total: Number(fila.total) };
}

/** Resumen público de todos los productos de una vez (para no hacer N consultas en el listado). */
export async function obtenerResumenProductos() {
  const [rows] = await pool.query(
    `SELECT producto_id, ROUND(AVG(calificacion), 1) AS promedio, COUNT(*) AS total
     FROM resenas_productos WHERE estado = 'aprobada' GROUP BY producto_id`
  );
  const mapa = {};
  for (const fila of rows) {
    mapa[fila.producto_id] = { promedio: Number(fila.promedio), total: Number(fila.total) };
  }
  return mapa;
}

/** Lista pública de reseñas aprobadas de un producto, más recientes primero. */
export async function obtenerResenasProductoAprobadas(productoId) {
  const [rows] = await pool.query(
    `SELECT r.id, r.calificacion, r.comentario, r.created_at, c.nombre AS cliente
     FROM resenas_productos r
     JOIN clientes c ON c.id = r.cliente_id
     WHERE r.producto_id = ? AND r.estado = 'aprobada'
     ORDER BY r.created_at DESC`,
    [productoId]
  );
  return rows;
}

/** Listado para el panel proveedor, filtrable por estado. */
export async function obtenerResenasProductoAdmin(estado) {
  const condiciones = [];
  const params = [];
  if (estado && ESTADOS_VALIDOS.includes(estado)) {
    condiciones.push('r.estado = ?');
    params.push(estado);
  }
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const [rows] = await pool.query(
    `SELECT r.id, r.calificacion, r.comentario, r.estado, r.created_at,
            p.name AS producto, c.nombre AS cliente
     FROM resenas_productos r
     JOIN productos p ON p.id = r.producto_id
     JOIN clientes c ON c.id = r.cliente_id
     ${where}
     ORDER BY r.created_at DESC`,
    params
  );
  return rows;
}

export async function cambiarEstadoResenaProducto(id, estado) {
  if (!ESTADOS_VALIDOS.includes(estado)) throw new Error('Estado inválido.');
  const [result] = await pool.query('UPDATE resenas_productos SET estado = ? WHERE id = ?', [estado, id]);
  if (result.affectedRows === 0) throw new Error('La reseña no existe.');
}

export async function eliminarResenaProducto(id) {
  const [result] = await pool.query('DELETE FROM resenas_productos WHERE id = ?', [id]);
  if (result.affectedRows === 0) throw new Error('La reseña no existe.');
}

/* ============================
   RESEÑAS DE ATENCIÓN AL CLIENTE
   ============================ */

/** Crea la reseña de atención de un pedido. Solo una por pedido, y solo si ya fue entregado. */
export async function guardarResenaAtencion({ pedidoId, clienteId, calificacion, comentario }) {
  const id = Number(pedidoId);
  if (!Number.isInteger(id) || id <= 0) throw new Error('Pedido inválido.');
  const cal = validarCalificacion(calificacion);
  const com = normalizarComentario(comentario);

  const [pedidos] = await pool.query(
    'SELECT id, cliente_id, estado FROM pedidos WHERE id = ?',
    [id]
  );
  if (pedidos.length === 0) throw new Error('El pedido no existe.');
  const pedido = pedidos[0];
  if (pedido.cliente_id !== clienteId) throw new Error('Este pedido no pertenece a tu cuenta.');
  if (pedido.estado !== 'entregado') throw new Error('Solo puedes calificar la atención de pedidos ya entregados.');

  const [existente] = await pool.query('SELECT id FROM resenas_atencion WHERE pedido_id = ?', [id]);
  if (existente.length > 0) throw new Error('Ya calificaste la atención de este pedido.');

  await pool.query(
    `INSERT INTO resenas_atencion (pedido_id, cliente_id, calificacion, comentario, estado)
     VALUES (?, ?, ?, ?, 'pendiente')`,
    [id, clienteId, cal, com]
  );
}

/** Resumen público (promedio y total) de atención al cliente, solo reseñas aprobadas. */
export async function obtenerResumenAtencion() {
  const [rows] = await pool.query(
    `SELECT ROUND(AVG(calificacion), 1) AS promedio, COUNT(*) AS total
     FROM resenas_atencion WHERE estado = 'aprobada'`
  );
  const fila = rows[0];
  return { promedio: fila.promedio ? Number(fila.promedio) : 0, total: Number(fila.total) };
}

/** Lista pública de reseñas de atención aprobadas, más recientes primero. */
export async function obtenerResenasAtencionAprobadas(limite = 20) {
  const [rows] = await pool.query(
    `SELECT r.id, r.calificacion, r.comentario, r.created_at, c.nombre AS cliente
     FROM resenas_atencion r
     JOIN clientes c ON c.id = r.cliente_id
     WHERE r.estado = 'aprobada'
     ORDER BY r.created_at DESC
     LIMIT ?`,
    [limite]
  );
  return rows;
}

/** Listado para el panel proveedor, filtrable por estado. */
export async function obtenerResenasAtencionAdmin(estado) {
  const condiciones = [];
  const params = [];
  if (estado && ESTADOS_VALIDOS.includes(estado)) {
    condiciones.push('r.estado = ?');
    params.push(estado);
  }
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const [rows] = await pool.query(
    `SELECT r.id, r.calificacion, r.comentario, r.estado, r.created_at, r.pedido_id,
            c.nombre AS cliente
     FROM resenas_atencion r
     JOIN clientes c ON c.id = r.cliente_id
     ${where}
     ORDER BY r.created_at DESC`,
    params
  );
  return rows;
}

export async function cambiarEstadoResenaAtencion(id, estado) {
  if (!ESTADOS_VALIDOS.includes(estado)) throw new Error('Estado inválido.');
  const [result] = await pool.query('UPDATE resenas_atencion SET estado = ? WHERE id = ?', [estado, id]);
  if (result.affectedRows === 0) throw new Error('La reseña no existe.');
}

export async function eliminarResenaAtencion(id) {
  const [result] = await pool.query('DELETE FROM resenas_atencion WHERE id = ?', [id]);
  if (result.affectedRows === 0) throw new Error('La reseña no existe.');
}
