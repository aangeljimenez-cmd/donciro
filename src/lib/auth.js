// src/lib/auth.js
import { SignJWT, jwtVerify } from 'jose';
import { timingSafeEqual } from 'node:crypto';

/* ============================
   AUTH PANEL PROVEEDOR (Basic Auth)
   ============================ */

/** Verifica las credenciales Basic Auth del panel proveedor contra las variables de entorno. */
export function estaAutorizado(request) {
  const header = request.headers.get('authorization');
  const usuarioValido = import.meta.env.PROVEEDOR_USER;
  const claveValida = import.meta.env.PROVEEDOR_PASS;

  if (!header || !header.startsWith('Basic ') || !usuarioValido || !claveValida) return false;

  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf-8');
    const separator = decoded.indexOf(':');
    if (separator === -1) return false;
    const recibido = Buffer.from(`${decoded.slice(0, separator)}:${decoded.slice(separator + 1)}`);
    const esperado = Buffer.from(`${usuarioValido}:${claveValida}`);
    return recibido.length === esperado.length && timingSafeEqual(recibido, esperado);
  } catch {
    return false;
  }
}

/** Respuesta JSON estándar 401 para endpoints del panel proveedor. */
export function respuestaNoAutorizada() {
  return new Response(JSON.stringify({ error: 'No autorizado' }), {
    status: 401,
    headers: {
      'Content-Type': 'application/json',
      'WWW-Authenticate': 'Basic realm="Panel proveedor"',
    },
  });
}

/* ============================
   SESIÓN DE CLIENTES (JWT + cookie httpOnly)
   ============================ */

function obtenerSecretKey() {
  const secret = import.meta.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET debe estar configurado y tener al menos 32 caracteres.');
  }
  return new TextEncoder().encode(secret);
}

export const SESSION_COOKIE_NAME = 'sesion_cliente';

/** Crea un JWT firmado con los datos básicos del cliente. */
export async function crearSesion(cliente) {
  return await new SignJWT({ id: cliente.id, rut: cliente.rut, nombre: cliente.nombre })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(obtenerSecretKey());
}

/** Verifica un JWT de sesión de cliente. Devuelve el payload o null si es inválido/expiró. */
export async function verificarSesion(token) {
  try {
    const { payload } = await jwtVerify(token, obtenerSecretKey());
    return payload; // { id, rut, nombre, iat, exp }
  } catch {
    return null;
  }
}

/** Opciones estándar para la cookie de sesión de cliente. */
export function opcionesCookieSesion() {
  return {
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 días
  };
}
