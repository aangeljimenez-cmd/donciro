// src/lib/inventario.js
import { pool } from './db.js';

/** Lista todos los productos con su stock, precio y unidad de medida actual, para la toma de inventario. */
export async function obtenerProductosParaInventario() {
  const [rows] = await pool.query(
    'SELECT id, name, stock, precio, id_umedida FROM productos ORDER BY name'
  );
  return rows;
}

/**
 * Guarda una toma de inventario:
 * - Actualiza el stock de cada producto al nuevo valor ingresado (el precio no se toca).
 * - Por producto calcula: costo_anterior = stock_anterior * precio, costo_nuevo = stock_nuevo * precio.
 * - ganancia_total = costo_total_anterior - costo_total_nuevo
 *   (positivo = el stock bajó, es decir se vendió inventario por ese valor;
 *    negativo = el stock subió más de lo esperado).
 * - merma = ganancia_total - venta_real
 *   (positivo = la venta real registrada fue menor a lo que el inventario perdido valía → falta dinero).
 * - Inserta un registro en `inventarios` con fecha, ganancia_total, venta_real, merma y el detalle.
 */
export async function guardarInventario(items, ventaReal) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('No se recibieron productos para el inventario.');
  }

  const venta = Number(ventaReal);
  if (Number.isNaN(venta) || venta < 0) {
    throw new Error('El monto de venta real es inválido.');
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const detalle = [];
    let costoTotalAnterior = 0;
    let costoTotalNuevo = 0;

    for (const item of items) {
      const idProducto = Number(item.id);
      const stockNuevo = Number(item.stock_nuevo);

      if (!idProducto) throw new Error('Falta el id de un producto.');
      if (Number.isNaN(stockNuevo) || stockNuevo < 0) {
        throw new Error(`Stock inválido para el producto id ${idProducto}.`);
      }

      const [rows] = await conn.query(
        'SELECT id, name, stock, precio FROM productos WHERE id = ? LIMIT 1 FOR UPDATE',
        [idProducto]
      );
      if (rows.length === 0) throw new Error(`Producto id ${idProducto} no existe.`);

      const producto = rows[0];
      const stockAnterior = Number(producto.stock);
      const precio = Number(producto.precio);

      const costoAnterior = stockAnterior * precio;
      const costoNuevo = stockNuevo * precio;

      await conn.query('UPDATE productos SET stock = ? WHERE id = ?', [stockNuevo, idProducto]);

      detalle.push({
        id_producto: idProducto,
        nombre: producto.name,
        precio,
        stock_anterior: stockAnterior,
        stock_nuevo: stockNuevo,
        diferencia_stock: stockNuevo - stockAnterior,
        costo_anterior: costoAnterior,
        costo_nuevo: costoNuevo,
      });

      costoTotalAnterior += costoAnterior;
      costoTotalNuevo += costoNuevo;
    }

    const gananciaTotal = costoTotalAnterior - costoTotalNuevo;
    const merma = gananciaTotal - venta;

    const [insertResult] = await conn.query(
      'INSERT INTO inventarios (fecha, ganancia_total, venta_real, merma, detalle) VALUES (NOW(), ?, ?, ?, ?)',
      [gananciaTotal, venta, merma, JSON.stringify(detalle)]
    );

    await conn.commit();
    return {
      id_inventario: insertResult.insertId,
      costo_total_anterior: costoTotalAnterior,
      costo_total_nuevo: costoTotalNuevo,
      ganancia_total: gananciaTotal,
      venta_real: venta,
      merma,
      detalle,
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}