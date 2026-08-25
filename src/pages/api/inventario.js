// src/pages/api/inventario.js
import { obtenerProductosParaInventario, guardarInventario } from '../../lib/inventario.js';
import { estaAutorizado, respuestaNoAutorizada } from '../../lib/auth.js';

export const prerender = false;

export async function GET({ request }) {
  if (!estaAutorizado(request)) return respuestaNoAutorizada();

  const productos = await obtenerProductosParaInventario();
  return new Response(JSON.stringify({ productos }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST({ request }) {
  if (!estaAutorizado(request)) return respuestaNoAutorizada();

  try {
    const body = await request.json();
    const resultado = await guardarInventario(body.items, body.venta_real);
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