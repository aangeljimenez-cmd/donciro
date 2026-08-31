// src/pages/api/resenas/producto.js
import {
  guardarResenaProducto,
  obtenerResumenProducto,
  obtenerResenasProductoAprobadas,
} from '../../../lib/resenas.js';

export const prerender = false;

export async function GET({ url }) {
  const productoId = Number(url.searchParams.get('productoId'));
  if (!Number.isInteger(productoId) || productoId <= 0) {
    return new Response(JSON.stringify({ error: 'productoId inválido' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const [resumen, resenas] = await Promise.all([
    obtenerResumenProducto(productoId),
    obtenerResenasProductoAprobadas(productoId),
  ]);

  return new Response(JSON.stringify({ ...resumen, resenas }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST({ request, locals }) {
  if (!locals.cliente) {
    return new Response(JSON.stringify({ error: 'Debes iniciar sesión para dejar una reseña.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { productoId, calificacion, comentario } = await request.json();
    await guardarResenaProducto({
      productoId,
      clienteId: locals.cliente.id,
      calificacion,
      comentario,
    });
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
