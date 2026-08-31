// src/lib/auth.js
import { SignJWT, jwtVerify } from 'jose';
import { timingSafeEqual } from 'node:crypto';
import { verificarLimite, registrarIntentoFallido, limpiarIntentos, obtenerIp } from './rateLimit.js';

/* ============================
   AUTH PANEL PROVEEDOR (Basic Auth)
   ============================ */

/** Verifica las credenciales Basic Auth del panel proveedor contra las variables de entorno. */
export function estaAutorizado(request) {
  const clave = `proveedor:${obtenerIp(request)}`;

  // Si esta IP ya superó el máximo de intentos fallidos, se corta aquí
  // sin siquiera revisar las credenciales enviadas.
  if (!verificarLimite(clave).permitido) return false;

  const header = request.headers.get('authorization');
  const usuarioValido = import.meta.env.PROVEEDOR_USER;
  const claveValida = import.meta.env.PROVEEDOR_PASS;

  if (!header || !header.startsWith('Basic ') || !usuarioValido || !claveValida) {
    registrarIntentoFallido(clave);
    return false;
  }

  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf-8');
    const separator = decoded.indexOf(':');
    if (separator === -1) {
      registrarIntentoFallido(clave);
      return false;
    }
    const recibido = Buffer.from(`${decoded.slice(0, separator)}:${decoded.slice(separator + 1)}`);
    const esperado = Buffer.from(`${usuarioValido}:${claveValida}`);
    const coincide = recibido.length === esperado.length && timingSafeEqual(recibido, esperado);

    if (coincide) limpiarIntentos(clave);
    else registrarIntentoFallido(clave);

    return coincide;
  } catch {
    registrarIntentoFallido(clave);
    return false;
  }
}