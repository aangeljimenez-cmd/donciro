import { obtenerItemsPedido } from '../../../../lib/pedidos.js';
import { estaAutorizado, respuestaNoAutorizada } from '../../../../lib/auth.js';

export const prerender = false;

export async function GET({ params, request }) {
  if (!estaAutorizado(request)) return respuestaNoAutorizada();

  const pedidoId = Number(params.id);
  if (!Number.isInteger(pedidoId) || pedidoId <= 0) {
    return new Response(JSON.stringify({ error: 'Id de pedido inválido' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const items = await obtenerItemsPedido(pedidoId);
  return new Response(JSON.stringify({ items }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
