// src/pages/api/resenas/atencion.js
import {
  guardarResenaAtencion,
  obtenerResumenAtencion,
  obtenerResenasAtencionAprobadas,
} from '../../../lib/resenas.js';

export const prerender = false;

export async function GET() {
  const [resumen, resenas] = await Promise.all([
    obtenerResumenAtencion(),
    obtenerResenasAtencionAprobadas(),
  ]);

  return new Response(JSON.stringify({ ...resumen, resenas }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST({ request, locals }) {
  if (!locals.cliente) {
    return new Response(JSON.stringify({ error: 'Debes iniciar sesión para calificar la atención.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { pedidoId, calificacion, comentario } = await request.json();
    await guardarResenaAtencion({
      pedidoId,
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
