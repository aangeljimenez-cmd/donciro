// src/pages/api/resenas/admin.js
import { estaAutorizado, respuestaNoAutorizada } from '../../../lib/auth.js';
import {
  obtenerResenasProductoAdmin,
  cambiarEstadoResenaProducto,
  eliminarResenaProducto,
  obtenerResenasAtencionAdmin,
  cambiarEstadoResenaAtencion,
  eliminarResenaAtencion,
} from '../../../lib/resenas.js';

export const prerender = false;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function GET({ request, url }) {
  if (!estaAutorizado(request)) return respuestaNoAutorizada();

  const tipo = url.searchParams.get('tipo');
  const estado = url.searchParams.get('estado') || undefined;

  if (tipo === 'atencion') {
    return json(await obtenerResenasAtencionAdmin(estado));
  }
  if (tipo === 'producto') {
    return json(await obtenerResenasProductoAdmin(estado));
  }
  return json({ error: 'tipo debe ser "producto" o "atencion"' }, 400);
}

export async function PATCH({ request }) {
  if (!estaAutorizado(request)) return respuestaNoAutorizada();

  try {
    const { tipo, id, estado } = await request.json();
    if (tipo === 'atencion') {
      await cambiarEstadoResenaAtencion(id, estado);
    } else if (tipo === 'producto') {
      await cambiarEstadoResenaProducto(id, estado);
    } else {
      throw new Error('tipo debe ser "producto" o "atencion"');
    }
    return json({ ok: true });
  } catch (err) {
    return json({ error: err.message }, 400);
  }
}

export async function DELETE({ request }) {
  if (!estaAutorizado(request)) return respuestaNoAutorizada();

  try {
    const { tipo, id } = await request.json();
    if (tipo === 'atencion') {
      await eliminarResenaAtencion(id);
    } else if (tipo === 'producto') {
      await eliminarResenaProducto(id);
    } else {
      throw new Error('tipo debe ser "producto" o "atencion"');
    }
    return json({ ok: true });
  } catch (err) {
    return json({ error: err.message }, 400);
  }
}
