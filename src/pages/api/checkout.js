// src/pages/api/checkout.js
import { crearPedido } from '../../lib/pedidos.js';

export const prerender = false;

export async function POST({ request }) {
  try {
    const body = await request.json();
    const pedido = await crearPedido(body);
    return new Response(JSON.stringify(pedido), {
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