// src/pages/api/clientes/login.js
import { autenticarCliente } from '../../../lib/clientes.js';
import { obtenerPedidosPorCliente } from '../../../lib/pedidos.js';
import { crearSesion, SESSION_COOKIE_NAME, opcionesCookieSesion } from '../../../lib/auth.js';
import { normalizarRut } from '../../../lib/rut.js';
import { verificarLimite, registrarIntentoFallido, limpiarIntentos, obtenerIp } from '../../../lib/rateLimit.js';

export const prerender = false;

export async function POST({ request, cookies, clientAddress }) {
  try {
    const { rut, password } = await request.json();

    if (!rut || !password) {
      return new Response(JSON.stringify({ error: 'Faltan rut o contraseña' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const ip = obtenerIp(request, clientAddress);
    const clave = `login:${ip}:${normalizarRut(rut)}`;

    const limite = verificarLimite(clave);
    if (!limite.permitido) {
      const minutos = Math.ceil(limite.segundosRestantes / 60);
      return new Response(
        JSON.stringify({ error: `Demasiados intentos fallidos. Intenta de nuevo en ${minutos} minuto${minutos === 1 ? '' : 's'}.` }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      );
    }

    let cliente;
    try {
      cliente = await autenticarCliente({ rut, password });
    } catch (err) {
      registrarIntentoFallido(clave);
      throw err;
    }

    limpiarIntentos(clave);

    const pedidos = await obtenerPedidosPorCliente(cliente.id);
    const token = await crearSesion(cliente);

    cookies.set(SESSION_COOKIE_NAME, token, opcionesCookieSesion());

    return new Response(JSON.stringify({ ok: true, cliente: { id: cliente.id, nombre: cliente.nombre }, pedidos }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'Error al iniciar sesión' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}