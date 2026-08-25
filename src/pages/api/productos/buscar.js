// src/pages/api/productos/buscar.js
import { buscarProductosPorNombre } from '../../../lib/compras.js';
import { estaAutorizado, respuestaNoAutorizada } from '../../../lib/auth.js';

export const prerender = false;

export async function GET({ url, request }) {
  if (!estaAutorizado(request)) return respuestaNoAutorizada();

  const nombre = url.searchParams.get('nombre');
  if (!nombre || !nombre.trim()) {
    return new Response(JSON.stringify({ resultados: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const resultados = await buscarProductosPorNombre(nombre.trim());
  return new Response(JSON.stringify({ resultados }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}