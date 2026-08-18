// src/pages/api/pedidos/pesaje.js
import { registrarCantidadesReales } from '../../../lib/pedidos.js';

export const prerender = false;

export async function POST({ request }) {
  try {
    const { items } = await request.json();
    const resultado = await registrarCantidadesReales(items);
    return new Response(JSON.stringify({ ok: true, ...resultado }), {
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