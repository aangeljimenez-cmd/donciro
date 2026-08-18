// src/pages/api/clientes/login.js
import { autenticarCliente } from '../../../lib/clientes.js';
import { obtenerPedidosPorCliente } from '../../../lib/pedidos.js';

export const prerender = false;

export async function POST({ request }) {
  try {
    const { nombre, rut, password } = await request.json();

    if (!nombre || !rut || !password) {
      return new Response(JSON.stringify({ error: 'Faltan nombre, rut o contraseña' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const cliente = await autenticarCliente({ nombre, rut, password });
    const pedidos = await obtenerPedidosPorCliente(cliente.id);

    return new Response(JSON.stringify({ ok: true, pedidos }), {
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