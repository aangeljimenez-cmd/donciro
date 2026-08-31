// src/lib/descuentos.js
import { pool } from './db.js';

export async function calcularDescuento(clienteId, totalCompra) {
  const [[config1]] = await pool.query(
    "SELECT valor FROM configuracion WHERE clave = 'monto_minimo_mayorista'"
  );
  const [[config2]] = await pool.query(
    "SELECT valor FROM configuracion WHERE clave = 'descuento_mayorista'"
  );
  // Si faltan estas filas en la tabla `configuracion`, no debe romper la compra:
  // simplemente no habrá descuento mayorista.
  const montoMinimo = config1 ? Number(config1.valor) : 0;
  const descuentoMayorista = config2 ? Number(config2.valor) : 0;

  let descuentoIndividual = 0;
  if (clienteId) {
    const [[cliente]] = await pool.query(
      'SELECT descuento_individual FROM clientes WHERE id = ?',
      [clienteId]
    );
    if (cliente) descuentoIndividual = Number(cliente.descuento_individual);
  }

  const esMayorista = totalCompra >= montoMinimo && montoMinimo > 0;

  if (esMayorista) {
    // Se queda con el más alto entre el individual y el mayorista
    return Math.max(descuentoIndividual, descuentoMayorista);
  }

  return descuentoIndividual; // solo descuento individual, o 0 si no tiene
}