// src/pages/api/compras.js
import { ingresarCompra } from '../../lib/compras.js';
import { estaAutorizado, respuestaNoAutorizada } from '../../lib/auth.js';

export const prerender = false;

export async function POST({ request }) {
  if (!estaAutorizado(request)) return respuestaNoAutorizada();

  try {
    const body = await request.json();
    const items = body.items;

    const resultado = await ingresarCompra(items);

    return new Response(JSON.stringify({ resultado }), {
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