// src/lib/compras.js
import { pool } from './db.js';

/** Busca un producto por nombre exacto (usado internamente al confirmar por nombre, sin id). */
export async function buscarProductoPorNombre(nombre) {
  const [rows] = await pool.query(
    'SELECT id, name, precio, stock, id_umedida FROM productos WHERE LOWER(name) = LOWER(?) LIMIT 1',
    [nombre]
  );
  return rows[0] || null;
}

/** Busca productos por coincidencia parcial de nombre, para autocompletado. */
export async function buscarProductosPorNombre(nombre, limite = 8) {
  const [rows] = await pool.query(
    'SELECT id, name, precio, stock, id_umedida FROM productos WHERE name LIKE ? ORDER BY name LIMIT ?',
    [`%${nombre}%`, limite]
  );
  return rows;
}

/**
 * Ingresa una compra: por cada item,
 * si trae un `id` (producto elegido desde el autocompletado), se usa ese id directamente.
 * Si no trae `id`, se busca por nombre exacto como respaldo.
 * Si existe, suma la cantidad al stock y actualiza el precio solo si se envió uno nuevo.
 * Si no existe, lo crea con los datos obligatorios (precio, categoría, marca, unidad).
 */
export async function ingresarCompra(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('No se recibieron productos para ingresar.');
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const resultado = [];

    for (const item of items) {
      const nombre = (item.nombre || '').trim();
      const cantidad = Number(item.cantidad);
      const idProducto = item.id ? Number(item.id) : null;

      if (!nombre) throw new Error('Falta el nombre de un producto.');
      if (!cantidad || cantidad <= 0) throw new Error(`Cantidad inválida para "${nombre}".`);

      const [rows] = idProducto
        ? await conn.query(
            'SELECT id, precio, stock FROM productos WHERE id = ? LIMIT 1 FOR UPDATE',
            [idProducto]
          )
        : await conn.query(
            'SELECT id, precio, stock FROM productos WHERE LOWER(name) = LOWER(?) LIMIT 1 FOR UPDATE',
            [nombre]
          );

      if (rows.length > 0) {
        // Producto existente: sumar stock, actualizar precio solo si viene uno nuevo
        const producto = rows[0];
        const hayPrecioNuevo = item.precio !== undefined && item.precio !== null && item.precio !== '';
        const nuevoPrecio = hayPrecioNuevo ? Number(item.precio) : producto.precio;

        await conn.query('UPDATE productos SET stock = stock + ?, precio = ? WHERE id = ?', [
          cantidad,
          nuevoPrecio,
          producto.id,
        ]);

        resultado.push({
          nombre,
          accion: 'actualizado',
          stock_sumado: cantidad,
          stock_total: Number(producto.stock) + cantidad,
          precio: nuevoPrecio,
        });
      } else {
        // Producto nuevo: se necesitan todos los datos obligatorios
        const { precio, id_cat, id_mar, id_umedida } = item;
        if (!precio) throw new Error(`"${nombre}" es un producto nuevo: falta el precio.`);
        if (!id_cat) throw new Error(`"${nombre}" es un producto nuevo: falta la categoría.`);
        if (!id_mar) throw new Error(`"${nombre}" es un producto nuevo: falta la marca.`);
        if (!id_umedida) throw new Error(`"${nombre}" es un producto nuevo: falta la unidad de medida.`);

        await conn.query(
          `INSERT INTO productos (id_cat, id_mar, id_umedida, name, precio, stock, disponible)
           VALUES (?, ?, ?, ?, ?, ?, 1)`,
          [id_cat, id_mar, id_umedida, nombre, Number(precio), cantidad]
        );

        resultado.push({ nombre, accion: 'creado', stock_total: cantidad, precio: Number(precio) });
      }
    }

    await conn.commit();
    return resultado;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}