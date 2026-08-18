// src/lib/clientes.js
import { pool } from './db.js';
import bcrypt from 'bcryptjs';

/**
 * Registra un cliente nuevo con contraseña, o completa el registro de un cliente
 * que ya existía (creado automáticamente en un checkout anterior) pero aún no
 * tenía contraseña.
 */
export async function registrarCliente({ nombre, rut, password, telefono }) {
  const [rows] = await pool.query('SELECT id, password_hash FROM clientes WHERE rut = ?', [rut]);
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
    [rut, nombre, telefono, passwordHash]
  );
  return { id: result.insertId };
}

/** Normaliza texto para comparar nombres de forma flexible: sin tildes, minúsculas, sin espacios extra. */
function normalizarNombre(texto) {
  return texto
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/** Verifica rut + nombre + contraseña. Lanza error si no coincide. */
export async function autenticarCliente({ nombre, rut, password }) {
  const [rows] = await pool.query(
    'SELECT id, nombre, password_hash FROM clientes WHERE rut = ?',
    [rut]
  );
  if (rows.length === 0) throw new Error('No existe una cuenta con ese RUT');
  const cliente = rows[0];

  if (!cliente.password_hash) {
    throw new Error('Esta cuenta aún no tiene contraseña. Completa tu registro primero.');
  }

  const nombreCoincide = normalizarNombre(cliente.nombre) === normalizarNombre(nombre);
  if (!nombreCoincide) throw new Error('Nombre o RUT incorrectos');

  const passwordCoincide = await bcrypt.compare(password, cliente.password_hash);
  if (!passwordCoincide) throw new Error('Contraseña incorrecta');

  return { id: cliente.id, nombre: cliente.nombre };
}