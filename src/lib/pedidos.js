// src/lib/pedidos.js
import { pool } from './db.js';
import { calcularDescuento } from './descuentos.js';

export async function buscarClientePorRut(rut) {
  const [rows] = await pool.query(
    'SELECT id, nombre, descuento_individual FROM clientes WHERE rut = ?',
    [rut]
  );
  return rows.length > 0 ? rows[0] : null;
}

export async function crearPedido({ nombre, telefono, direccion, rut, email, items }) {
  if (!nombre || !telefono || !direccion) {
    throw new Error('Faltan datos del cliente (nombre, teléfono o dirección).');
  }
  if (!rut || !rut.trim()) {
    throw new Error('El RUT es obligatorio.');
  }
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('El carrito está vacío.');
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    let cliente = await buscarClientePorRut(rut);

    if (!cliente) {
      const [result] = await conn.query(
        `INSERT INTO clientes (rut, nombre, email, telefono, descuento_individual, creado_en)
         VALUES (?, ?, ?, ?, 0, NOW())`,
        [rut, nombre, email ?? null, telefono]
      );
      cliente = { id: result.insertId, nombre, descuento_individual: 0 };
    }

    let subtotal = 0;
    const itemsProcesados = [];

    for (const item of items) {
      const [rows] = await conn.query(
        `SELECT p.id, p.name, p.precio, p.stock, p.cantidad_minima, p.disponible, u.name AS unidad
         FROM productos p
         JOIN unidad_medida u ON p.id_umedida = u.id
         WHERE p.id = ? FOR UPDATE`,
        [item.id]
      );
      if (rows.length === 0) {
        throw new Error(`Producto ${item.id} no existe`);
      }
      const producto = rows[0];
      if (!producto.disponible) {
        throw new Error(`"${producto.name}" ya no está disponible`);
      }
      if (producto.precio === null) {
        throw new Error(`Producto "${producto.name}" no tiene precio asignado`);
      }
      if (Number(item.cantidad) < Number(producto.cantidad_minima)) {
        const esPeso = producto.unidad === 'kg' || producto.unidad === 'litro';
        const mensajeMinimo = esPeso
          ? `${Number(producto.cantidad_minima) * 1000} ${producto.unidad === 'kg' ? 'gr' : 'ml'}`
          : `${Number(producto.cantidad_minima)} unidades`;
        throw new Error(`"${producto.name}" tiene una compra mínima de ${mensajeMinimo}`);
      }

      const esPeso = producto.unidad === 'kg' || producto.unidad === 'litro';
      const tolerancia = esPeso ? 0.05 : 0;
      if (producto.stock < Number(item.cantidad) - tolerancia) {
        throw new Error(`Stock insuficiente para "${producto.name}"`);
      }

      const subtotalItem = Number(producto.precio) * Number(item.cantidad);
      subtotal += subtotalItem;

      itemsProcesados.push({
        producto_id: producto.id,
        producto_nombre: producto.name,
        cantidad: item.cantidad,
        unidad: producto.unidad,
        precio_unitario: producto.precio,
        subtotal: subtotalItem,
      });
    }

    const descuentoPct = await calcularDescuento(cliente?.id ?? null, subtotal);
    const descuentoMonto = Number((subtotal * descuentoPct) / 100);
    const total = Number(subtotal - descuentoMonto);

    const [result] = await conn.query(
      `INSERT INTO pedidos
        (cliente_id, nombre, cliente_telefono, rut, direccion_entrega, subtotal, descuento_pct, descuento_monto, total, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendiente')`,
      [cliente.id, nombre, telefono, rut, direccion, subtotal, descuentoPct, descuentoMonto, total]
    );
    const pedidoId = result.insertId;

    for (const it of itemsProcesados) {
      await conn.query(
        `INSERT INTO pedido_items
          (pedido_id, producto_id, producto_nombre, cantidad, unidad, precio_unitario, subtotal)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [pedidoId, it.producto_id, it.producto_nombre, it.cantidad, it.unidad, it.precio_unitario, it.subtotal]
      );
    }

    await conn.commit();

    return {
      id: pedidoId,
      nombre,
      telefono,
      direccion,
      items: itemsProcesados,
      subtotal,
      descuentoPct,
      descuentoMonto,
      total,
      esClienteRegistrado: !!cliente,
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function listarPedidos() {
  const [rows] = await pool.query(
    `SELECT id, nombre, cliente_telefono AS telefono, rut, direccion_entrega AS direccion,
            subtotal, descuento_pct, descuento_monto, total, estado, created_at
     FROM pedidos
     ORDER BY created_at DESC`
  );
  return rows;
}

export async function obtenerItemsPedido(pedidoId) {
  const [rows] = await pool.query(
    'SELECT id, producto_id, producto_nombre, cantidad, unidad, precio_unitario, subtotal, cantidad_real FROM pedido_items WHERE pedido_id = ?',
    [pedidoId]
  );
  return rows;
}

const ESTADOS_VALIDOS = ['pendiente', 'en_preparacion', 'en_ruta', 'entregado'];

export async function actualizarEstadoPedido(pedidoId, nuevoEstado) {
  if (!ESTADOS_VALIDOS.includes(nuevoEstado)) {
    throw new Error(`Estado inválido: ${nuevoEstado}`);
  }
  await pool.query('UPDATE pedidos SET estado = ? WHERE id = ?', [nuevoEstado, pedidoId]);
}

/** Registra el peso/cantidad real pesada de cada item y recalcula el total del pedido. */
export async function registrarCantidadesReales(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('No se recibieron items para actualizar');
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    let pedidoId = null;

    for (const { pedido_item_id, cantidad_real } of items) {
      const [itemRows] = await conn.query(
        `SELECT pi.id, pi.pedido_id, pi.producto_id, pi.cantidad_real, pi.precio_unitario,
                p.estado
         FROM pedido_items pi
         JOIN pedidos p ON p.id = pi.pedido_id
         WHERE pi.id = ? FOR UPDATE`,
        [pedido_item_id]
      );
      if (itemRows.length === 0) {
        throw new Error(`Item de pedido ${pedido_item_id} no encontrado`);
      }
      const item = itemRows[0];

      if (item.estado === 'entregado') {
        throw new Error('No se puede editar el pesaje de un pedido ya entregado');
      }
      if (Number(cantidad_real) < 0) {
        throw new Error('La cantidad real no puede ser negativa');
      }

      pedidoId = item.pedido_id;

      const cantidadAnterior = item.cantidad_real !== null ? Number(item.cantidad_real) : 0;
      const diferencia = Number(cantidad_real) - cantidadAnterior;

      await conn.query('UPDATE productos SET stock = stock - ? WHERE id = ?', [diferencia, item.producto_id]);

      const nuevoSubtotalItem = Number(item.precio_unitario) * Number(cantidad_real);

      await conn.query('UPDATE pedido_items SET cantidad_real = ?, subtotal = ? WHERE id = ?', [
        cantidad_real,
        nuevoSubtotalItem,
        pedido_item_id,
      ]);
    }

    const [sumRows] = await conn.query('SELECT SUM(subtotal) AS subtotal FROM pedido_items WHERE pedido_id = ?', [
      pedidoId,
    ]);
    const nuevoSubtotalPedido = Number(sumRows[0].subtotal ?? 0);

    const [pedidoRows] = await conn.query('SELECT descuento_pct FROM pedidos WHERE id = ?', [pedidoId]);
    const descuentoPct = Number(pedidoRows[0].descuento_pct);
    const nuevoDescuentoMonto = Number((nuevoSubtotalPedido * descuentoPct) / 100);
    const nuevoTotal = Number(nuevoSubtotalPedido - nuevoDescuentoMonto);

    await conn.query('UPDATE pedidos SET subtotal = ?, descuento_monto = ?, total = ? WHERE id = ?', [
      nuevoSubtotalPedido,
      nuevoDescuentoMonto,
      nuevoTotal,
      pedidoId,
    ]);

    await conn.commit();

    return { subtotalPedido: nuevoSubtotalPedido, total: nuevoTotal };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** Obtiene un pedido por id junto con sus items, para la página de seguimiento. */
export async function obtenerPedidoPorId(pedidoId) {
  const [rows] = await pool.query(
    `SELECT id, nombre, cliente_telefono AS telefono, direccion_entrega AS direccion,
            subtotal, descuento_pct, descuento_monto, total, estado, created_at
     FROM pedidos
     WHERE id = ?`,
    [pedidoId]
  );
  if (rows.length === 0) return null;

  const pedido = rows[0];
  pedido.items = await obtenerItemsPedido(pedidoId);
  return pedido;
}

/** Lista los pedidos de un cliente registrado, más recientes primero. */
export async function obtenerPedidosPorCliente(clienteId) {
  const [rows] = await pool.query(
    `SELECT id, subtotal, descuento_pct, descuento_monto, total, estado, created_at
     FROM pedidos WHERE cliente_id = ? ORDER BY created_at DESC`,
    [clienteId]
  );
  return rows;
}