// src/pages/api/checkout.js
import { pool } from '../../lib/db.js';
import { calcularDescuento } from '../../lib/descuentos.js';

export async function POST({ request }) {
  const { items, nombre, email, usuario_id, cliente_id } = await request.json();
  // items = [{ id: 5, cantidad: 0.5 }, ...]  cantidad en kg si es a granel, o unidades

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    let total = 0;
    const detalles = [];
    let tieneGranel = false;

    for (const item of items) {
      const [[producto]] = await conn.query(
        `SELECT p.id, p.precio, p.stock, u.name AS unidad
         FROM productos p
         JOIN unidad_medida u ON p.id_umedida = u.id
         WHERE p.id = ? FOR UPDATE`,
        [item.id]
      );

      if (!producto) throw new Error(`Producto ${item.id} no existe`);
      if (producto.stock < item.cantidad) {
        throw new Error(`Sin stock suficiente para "${producto.id}"`);
      }

      const esGranel = producto.unidad === 'kg';
      const subtotalEstimado = producto.precio * item.cantidad;
      total += subtotalEstimado;

      if (esGranel) {
        // No se descuenta stock aún: queda reservado, se resuelve al pesar
        tieneGranel = true;
        detalles.push({
          id: item.id,
          cantidad_solicitada: item.cantidad,
          precio: producto.precio,
          subtotal_estimado: subtotalEstimado,
          cantidad_real: null,
          subtotal_real: null,
        });
      } else {
        // Se resuelve de inmediato, igual que antes
        await conn.query('UPDATE productos SET stock = stock - ? WHERE id = ?', [
          item.cantidad,
          item.id,
        ]);
        detalles.push({
          id: item.id,
          cantidad_solicitada: item.cantidad,
          precio: producto.precio,
          subtotal_estimado: subtotalEstimado,
          cantidad_real: item.cantidad,
          subtotal_real: subtotalEstimado,
        });
      }
    }

    const descuentoPct = await calcularDescuento(cliente_id ?? null, total);
    const totalConDescuento = total - (total * descuentoPct) / 100;
    const estadoInicial = tieneGranel ? 'en_preparacion' : 'completado';

    const [pedidoResult] = await conn.query(
      `INSERT INTO pedidos (usuario_id, cliente_id, nombre_cliente, email_cliente, total, descuento_aplicado, estado, monto_final)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        usuario_id ?? null,
        cliente_id ?? null,
        nombre,
        email,
        totalConDescuento,
        descuentoPct,
        estadoInicial,
        tieneGranel ? null : totalConDescuento,
      ]
    );
    const pedidoId = pedidoResult.insertId;

    for (const d of detalles) {
      await conn.query(
        `INSERT INTO detalle_pedido
         (pedido_id, producto_id, cantidad_solicitada, precio_unitario, subtotal_estimado, cantidad_real, subtotal_real)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [pedidoId, d.id, d.cantidad_solicitada, d.precio, d.subtotal_estimado, d.cantidad_real, d.subtotal_real]
      );

      if (d.cantidad_real !== null) {
        await conn.query(
          `INSERT INTO movimientos_inventario (producto_id, pedido_id, tipo_movimiento, cantidad)
           VALUES (?, ?, 'venta_real', ?)`,
          [d.id, pedidoId, -d.cantidad_real]
        );
      }
    }

    await conn.commit();
    return new Response(
      JSON.stringify({ ok: true, pedidoId, total: totalConDescuento, estado: estadoInicial }),
      { status: 200 }
    );
  } catch (err) {
    await conn.rollback();
    return new Response(JSON.stringify({ ok: false, error: err.message }), { status: 400 });
  } finally {
    conn.release();
  }
}