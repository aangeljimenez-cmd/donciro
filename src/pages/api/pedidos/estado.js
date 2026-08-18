// src/pages/api/pedidos/estado.js
import { actualizarEstadoPedido } from '../../../lib/pedidos.js';

export const prerender = false;

export async function POST({ request }) {
  try {
    const { id, estado } = await request.json();
    await actualizarEstadoPedido(id, estado);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}