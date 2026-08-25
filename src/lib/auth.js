// src/lib/auth.js
import { SignJWT, jwtVerify } from 'jose';

/* ============================
   AUTH PANEL PROVEEDOR (Basic Auth)
   ============================ */

/** Verifica las credenciales Basic Auth del panel proveedor contra las variables de entorno. */
export function estaAutorizado(request) {
  const header = request.headers.get('authorization');
  const usuarioValido = import.meta.env.PROVEEDOR_USER;
  const claveValida = import.meta.env.PROVEEDOR_PASS;

  if (!header || !header.startsWith('Basic ')) return false;

  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf-8');
  const [usuario, clave] = decoded.split(':');
  return usuario === usuarioValido && clave === claveValida;
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

const secretKey = new TextEncoder().encode(
  import.meta.env.JWT_SECRET || 'cambia-esto-por-una-clave-larga-y-secreta'
);

export const SESSION_COOKIE_NAME = 'sesion_cliente';

/** Crea un JWT firmado con los datos básicos del cliente. */
export async function crearSesion(cliente) {
  return await new SignJWT({ id: cliente.id, rut: cliente.rut, nombre: cliente.nombre })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secretKey);
}

/** Verifica un JWT de sesión de cliente. Devuelve el payload o null si es inválido/expiró. */
export async function verificarSesion(token) {
  try {
    const { payload } = await jwtVerify(token, secretKey);
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