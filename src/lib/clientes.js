// src/lib/clientes.js
import { pool } from './db.js';
import bcrypt from 'bcryptjs';
import { normalizarRut, formatoRutValido, digitoVerificadorValido } from './rut.js';

/**
 * Registra un cliente nuevo con contraseña, o completa el registro de un cliente
 * que ya existía (creado automáticamente en un checkout anterior) pero aún no
 * tenía contraseña.
 */
export async function registrarCliente({ nombre, rut, password, telefono }) {
  const rutNormalizado = normalizarRut(rut);
  if (!formatoRutValido(rutNormalizado) || !digitoVerificadorValido(rutNormalizado)) {
    throw new Error('El RUT ingresado no es válido');
  }

  if (typeof telefono !== 'string' || !/^\d{9}$/.test(telefono)) {
    throw new Error('El teléfono debe tener exactamente 9 dígitos.');
  }

  const [rows] = await pool.query('SELECT id, password_hash FROM clientes WHERE rut = ?', [rutNormalizado]);
  const passwordHash = await bcrypt.hash(password, 10);

  if (rows.length > 0) {
    const existente = rows[0];
    if (existente.password_hash) {
      throw new Error('Ya existe una cuenta registrada con ese RUT');
    }
    await pool.query(
      'UPDATE clientes SET nombre = ?, telefono = ?, password_hash = ? WHERE id = ?',
      [nombre, telefono, passwordHash, existente.id]
    );
    return { id: existente.id };
  }

  const [result] = await pool.query(
    `INSERT INTO clientes (rut, nombre, telefono, password_hash, descuento_individual, creado_en)
     VALUES (?, ?, ?, ?, 0, NOW())`,
    [rutNormalizado, nombre, telefono, passwordHash]
  );
  return { id: result.insertId };
}

/**
 * Busca un cliente por RUT para el flujo de /registro: indica si el RUT ya existe
 * en la base (por ejemplo, creado automáticamente por un checkout anterior) y,
 * si existe, si esa cuenta ya tiene contraseña (registro completo) o no.
 */
export async function buscarClienteParaRegistro(rut) {
  const rutNormalizado = normalizarRut(rut);
  const [rows] = await pool.query(
    'SELECT id, password_hash FROM clientes WHERE rut = ?',
    [rutNormalizado]
  );
  if (rows.length === 0) {
    return { existe: false, tieneCuenta: false };
  }
  const cliente = rows[0];
  return { existe: true, tieneCuenta: !!cliente.password_hash };
}

/** Verifica rut + contraseña. Lanza error si no coincide. */
export async function autenticarCliente({ rut, password }) {
  const rutNormalizado = normalizarRut(rut);
  const [rows] = await pool.query(
    'SELECT id, nombre, password_hash FROM clientes WHERE rut = ?',
    [rutNormalizado]
  );
  if (rows.length === 0) throw new Error('No existe una cuenta con ese RUT');
  const cliente = rows[0];

  if (!cliente.password_hash) {
    throw new Error('Esta cuenta aún no tiene contraseña. Completa tu registro primero.');
  }

  const passwordCoincide = await bcrypt.compare(password, cliente.password_hash);
  if (!passwordCoincide) throw new Error('RUT o contraseña incorrectos');

  return { id: cliente.id, nombre: cliente.nombre };
}
