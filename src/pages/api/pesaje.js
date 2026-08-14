// src/pages/api/pesaje.js
import { pool } from '../../lib/db.js';

export async function POST({ request }) {
  const { detalle_id, gramos_reales } = await request.json();
  const cantidadReal = gramos_reales / 1000;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[detalle]] = await conn.query(
      'SELECT * FROM detalle_pedido WHERE id = ? FOR UPDATE',
      [detalle_id]
    );
    if (!detalle) throw new Error('Detalle de pedido no encontrado');
    if (detalle.cantidad_real !== null) throw new Error('Este ítem ya fue pesado');

    const subtotalReal = detalle.precio_unitario * cantidadReal;

    await conn.query(
      'UPDATE detalle_pedido SET cantidad_real = ?, subtotal_real = ? WHERE id = ?',
      [cantidadReal, subtotalReal, detalle_id]
    );

    await conn.query('UPDATE productos SET stock = stock - ? WHERE id = ?', [
      cantidadReal,
      detalle.producto_id,
    ]);

    await conn.query(
      `INSERT INTO movimientos_inventario (producto_id, pedido_id, tipo_movimiento, cantidad)
       VALUES (?, ?, 'venta_real', ?)`,
      [detalle.producto_id, detalle.pedido_id, -cantidadReal]
    );

    // ¿Quedan ítems sin pesar en este pedido?
    const [[{ pendientes }]] = await conn.query(
      'SELECT COUNT(*) AS pendientes FROM detalle_pedido WHERE pedido_id = ? AND cantidad_real IS NULL',
      [detalle.pedido_id]
    );

    if (pendientes === 0) {
      const [[{ montoFinal }]] = await conn.query(
        'SELECT SUM(subtotal_real) AS montoFinal FROM detalle_pedido WHERE pedido_id = ?',
        [detalle.pedido_id]
      );
      await conn.query('UPDATE pedidos SET estado = ?, monto_final = ? WHERE id = ?', [
        'completado',
        montoFinal,
        detalle.pedido_id,
      ]);
    }

    await conn.commit();
    return new Response(JSON.stringify({ ok: true, pendientes }), { status: 200 });
  } catch (err) {
    await conn.rollback();
    return new Response(JSON.stringify({ ok: false, error: err.message }), { status: 400 });
  } finally {
    conn.release();
  }
}