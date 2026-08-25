// src/middleware.js
import { verificarSesion, SESSION_COOKIE_NAME } from './lib/auth.js';

export const onRequest = async (context, next) => {
  const { request, url, cookies } = context;

  // --- Sesión de clientes: se resuelve en TODAS las rutas ---
  const token = cookies.get(SESSION_COOKIE_NAME)?.value;
  context.locals.cliente = token ? await verificarSesion(token) : null;

  // --- Rutas del panel proveedor (Basic Auth) ---
  const rutasProveedor = ['/pedidos', '/api/pesaje', '/api/estado'];
  const requiereAuthProveedor = rutasProveedor.some((ruta) => url.pathname.startsWith(ruta));

  if (requiereAuthProveedor) {
    const header = request.headers.get('authorization') || '';
    if (!header.startsWith('Basic ')) {
      return new Response('Autenticación requerida', {
        status: 401,
        headers: { 'WWW-Authenticate': 'Basic realm="Panel proveedor"' },
      });
    }

    const [user, pass] = atob(header.slice(6)).split(':');
    const autenticado = user === import.meta.env.PROVEEDOR_USER && pass === import.meta.env.PROVEEDOR_PASS;

    if (!autenticado) {
      return new Response('Autenticación requerida', {
        status: 401,
        headers: { 'WWW-Authenticate': 'Basic realm="Panel proveedor"' },
      });
    }

    return next();
  }

  // --- Rutas de API de clientes que requieren cookie válida ---
  // (mis-pedidos.astro NO va aquí: esa página maneja su propio estado
  // logueado/no-logueado internamente, así que no debe redirigirse).
  const rutasApiClientes = ['/api/clientes/pedidos'];
  const requiereAuthCliente = rutasApiClientes.some((ruta) => url.pathname.startsWith(ruta));

  if (requiereAuthCliente && !context.locals.cliente) {
    return new Response(JSON.stringify({ error: 'No autorizado' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return next();
};