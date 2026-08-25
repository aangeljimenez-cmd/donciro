// src/pages/api/pedidos/[id]/items.js
import { obtenerItemsPedido } from '../../../../lib/pedidos.js';
import { estaAutorizado, respuestaNoAutorizada } from '../../../../lib/auth.js';

export const prerender = false;

export async function GET({ params, request }) {
  if (!estaAutorizado(request)) return respuestaNoAutorizada();

  const items = await obtenerItemsPedido(params.id);
  return new Response(JSON.stringify({ items }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}