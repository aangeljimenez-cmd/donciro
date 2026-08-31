import { registrarCantidadesReales } from '../../../lib/pedidos.js';
import { estaAutorizado, respuestaNoAutorizada } from '../../../lib/auth.js';

export const prerender = false;

export async function POST({ request }) {
  if (!estaAutorizado(request)) return respuestaNoAutorizada();

  try {
    const { items } = await request.json();
    const resultado = await registrarCantidadesReales(items);
    return new Response(JSON.stringify({ ok: true, resultado }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'No se pudo guardar el pesaje.' }), {
      status: 422,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
