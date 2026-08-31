// src/lib/pedidos.js
import crypto from 'node:crypto';
import { pool } from './db.js';
import { calcularDescuento } from './descuentos.js';
import { normalizarRut, formatoRutValido, digitoVerificadorValido } from './rut.js';

/**
 * Genera un código de seguimiento aleatorio y no adivinable (160 bits de entropía).
 * Se usa como clave pública del pedido en vez del id correlativo, para que
 * nadie pueda ver el pedido de otra persona probando números consecutivos.
 */
function generarCodigoSeguimiento() {
  return crypto.randomBytes(20).toString('hex');
}

export async function buscarClientePorRut(rut) {
  const rutNormalizado = normalizarRut(rut);
  const [rows] = await pool.query(
    'SELECT id, nombre, descuento_individual FROM clientes WHERE rut = ?',
    [rutNormalizado]
  );
  return rows.length > 0 ? rows[0] : null;
}

export async function crearPedido({ nombre, telefono, direccion, rut, email, lat, lng, items }) {
  if (
    typeof nombre !== 'string' || typeof telefono !== 'string' || typeof direccion !== 'string' ||
    !nombre.trim() || !telefono.trim() || !direccion.trim() ||
    nombre.trim().length > 120 || telefono.trim().length > 30 || direccion.trim().length > 300
  ) {
    throw new Error('Faltan datos del cliente (nombre, teléfono o dirección).');
  }
  if (!rut || !rut.trim()) {
    throw new Error('El RUT es obligatorio.');
  }
  const rutNormalizado = normalizarRut(rut);
  if (!formatoRutValido(rutNormalizado) || !digitoVerificadorValido(rutNormalizado)) {
    throw new Error('El RUT ingresado no es válido.');
  }
  if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
    throw new Error('El carrito está vacío.');
  }
  if (email !== undefined && email !== null && (typeof email !== 'string' || email.length > 254)) {
    throw new Error('El email ingresado no es válido.');
  }

  // La ubicación del mapa es opcional: solo llega cuando el cliente marcó un punto
  // en el mapa interactivo del carrito. Si llega, debe ser un par de coordenadas válidas.
  let latValidada = null;
  let lngValidada = null;
  if (lat !== undefined && lat !== null && lng !== undefined && lng !== null) {
    latValidada = Number(lat);
    lngValidada = Number(lng);
    if (
      !Number.isFinite(latValidada) || !Number.isFinite(lngValidada) ||
      latValidada < -90 || latValidada > 90 || lngValidada < -180 || lngValidada > 180
    ) {
      throw new Error('La ubicación marcada en el mapa no es válida.');
    }
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    let cliente = await buscarClientePorRut(rutNormalizado);

    if (!cliente) {
      const [result] = await conn.query(
        `INSERT INTO clientes (rut, nombre, email, telefono, descuento_individual, creado_en)
         VALUES (?, ?, ?, ?, 0, NOW())`,
        [rutNormalizado, nombre, email ?? null, telefono]
      );
      cliente = { id: result.insertId, nombre, descuento_individual: 0 };
    }

    let subtotal = 0;
    const itemsProcesados = [];
    const productosIncluidos = new Set();

    for (const item of items) {
      const productoId = Number(item?.id);
      const cantidad = Number(item?.cantidad);
      if (!Number.isInteger(productoId) || productoId <= 0 || !Number.isFinite(cantidad) || cantidad <= 0) {
        throw new Error('El carrito contiene un producto o cantidad inválidos.');
      }
      if (productosIncluidos.has(productoId)) {
        throw new Error('El carrito contiene productos duplicados.');
      }
      productosIncluidos.add(productoId);
      const [rows] = await conn.query(
        `SELECT p.id, p.name, p.precio, p.stock, p.cantidad_minima, p.disponible, u.name AS unidad
         FROM productos p
         JOIN unidad_medida u ON p.id_umedida = u.id
         WHERE p.id = ? FOR UPDATE`,
        [productoId]
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

      const esPeso = producto.unidad === 'kg' || producto.unidad === 'litro';

      // Los productos que se venden por unidad nunca pueden pedirse en cantidades
      // fraccionarias (ej. "0.5 un." de vinagre). Se valida también en el servidor
      // por si el front-end llega a enviar un valor decimal.
      if (!esPeso && !Number.isInteger(cantidad)) {
        throw new Error(`"${producto.name}" se vende por unidad; la cantidad debe ser un número entero`);
      }

      if (cantidad < Number(producto.cantidad_minima)) {
        const mensajeMinimo = esPeso
          ? `${Number(producto.cantidad_minima) * 1000} ${producto.unidad === 'kg' ? 'gr' : 'ml'}`
          : `${Number(producto.cantidad_minima)} unidades`;
        throw new Error(`"${producto.name}" tiene una compra mínima de ${mensajeMinimo}`);
      }

      if (Number(producto.stock) < cantidad) {
        throw new Error(`Stock insuficiente para "${producto.name}"`);
      }

      const subtotalItem = Number(producto.precio) * cantidad;
      subtotal += subtotalItem;

      // Reservamos el stock ahora, dentro de la misma transacción del pedido.
      // El pesaje posterior sólo ajustará la diferencia respecto a esta cantidad.
      await conn.query('UPDATE productos SET stock = stock - ? WHERE id = ?', [cantidad, producto.id]);

      itemsProcesados.push({
        producto_id: producto.id,
        producto_nombre: producto.name,
        cantidad,
        unidad: producto.unidad,
        precio_unitario: producto.precio,
        subtotal: subtotalItem,
      });
    }

    const descuentoPct = await calcularDescuento(cliente?.id ?? null, subtotal);
    const descuentoMonto = Number((subtotal * descuentoPct) / 100);
    const total = Number(subtotal - descuentoMonto);
    const codigoSeguimiento = generarCodigoSeguimiento();

    const [result] = await conn.query(
      `INSERT INTO pedidos
        (cliente_id, nombre, cliente_telefono, rut, direccion_entrega, lat, lng, subtotal, descuento_pct, descuento_monto, total, estado, codigo_seguimiento)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendiente', ?)`,
      [cliente.id, nombre, telefono, rutNormalizado, direccion, latValidada, lngValidada, subtotal, descuentoPct, descuentoMonto, total, codigoSeguimiento]
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
      codigo: codigoSeguimiento,
      nombre,
      telefono,
      direccion,
      lat: latValidada,
      lng: lngValidada,
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
    `SELECT id, nombre, cliente_telefono AS telefono, rut, direccion_entrega AS direccion, lat, lng,
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
      const itemId = Number(pedido_item_id);
      const cantidadReal = Number(cantidad_real);
      if (!Number.isInteger(itemId) || itemId <= 0 || !Number.isFinite(cantidadReal)) {
        throw new Error('Los datos de pesaje no son válidos');
      }
      const [itemRows] = await conn.query(
        `SELECT pi.id, pi.pedido_id, pi.producto_id, pi.cantidad, pi.cantidad_real, pi.precio_unitario,
                p.estado, pr.stock
         FROM pedido_items pi
         JOIN pedidos p ON p.id = pi.pedido_id
         JOIN productos pr ON pr.id = pi.producto_id
         WHERE pi.id = ? FOR UPDATE`,
        [itemId]
      );
      if (itemRows.length === 0) {
        throw new Error(`Item de pedido ${pedido_item_id} no encontrado`);
      }
      const item = itemRows[0];

      if (item.estado === 'entregado') {
        throw new Error('No se puede editar el pesaje de un pedido ya entregado');
      }
      if (cantidadReal < 0) {
        throw new Error('La cantidad real no puede ser negativa');
      }

      if (pedidoId !== null && pedidoId !== item.pedido_id) {
        throw new Error('Todos los items deben pertenecer al mismo pedido');
      }
      pedidoId = item.pedido_id;

      // El stock solicitado ya quedó reservado al confirmar el pedido. Sólo se
      // descuenta o devuelve la diferencia al corregir el pesaje.
      const cantidadAnterior = item.cantidad_real !== null ? Number(item.cantidad_real) : Number(item.cantidad);
      const diferencia = cantidadReal - cantidadAnterior;
      if (diferencia > 0 && Number(item.stock) < diferencia) {
        throw new Error('Stock insuficiente para registrar ese pesaje');
      }

      await conn.query('UPDATE productos SET stock = stock - ? WHERE id = ?', [diferencia, item.producto_id]);

      const nuevoSubtotalItem = Number(item.precio_unitario) * cantidadReal;

      await conn.query('UPDATE pedido_items SET cantidad_real = ?, subtotal = ? WHERE id = ?', [
        cantidadReal,
        nuevoSubtotalItem,
        itemId,
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

/**
 * Obtiene un pedido por su código de seguimiento (token aleatorio no adivinable),
 * para la página pública de seguimiento.
 *
 * IMPORTANTE: nunca buscar el pedido por su id correlativo aquí. Antes se hacía
 * así (`obtenerPedidoPorId`) y cualquiera podía ver el pedido de otra persona
 * con solo cambiar el número en la URL (`/seguimiento?pedido=3`). El código de
 * seguimiento se genera con 160 bits de aleatoriedad al crear el pedido, así
 * que no es adivinable ni enumerable.
 */
export async function obtenerPedidoPorCodigo(codigo) {
  if (!codigo || typeof codigo !== 'string') return null;

  const [rows] = await pool.query(
    `SELECT id, nombre, cliente_telefono AS telefono, direccion_entrega AS direccion, lat, lng,
            subtotal, descuento_pct, descuento_monto, total, estado, created_at,
            codigo_seguimiento AS codigo
     FROM pedidos
     WHERE codigo_seguimiento = ?`,
    [codigo]
  );
  if (rows.length === 0) return null;

  const pedido = rows[0];
  pedido.items = await obtenerItemsPedido(pedido.id);
  return pedido;
}

/** Lista los pedidos de un cliente registrado, más recientes primero. */
export async function obtenerPedidosPorCliente(clienteId) {
  const [rows] = await pool.query(
    `SELECT id, subtotal, descuento_pct, descuento_monto, total, estado, created_at,
            codigo_seguimiento AS codigo
     FROM pedidos WHERE cliente_id = ? ORDER BY created_at DESC`,
    [clienteId]
  );
  return rows;
}