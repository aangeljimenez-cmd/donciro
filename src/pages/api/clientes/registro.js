// src/pages/api/clientes/registro.js
import { registrarCliente } from '../../../lib/clientes.js';

export const prerender = false;

export async function POST({ request }) {
  try {
    const { nombre, rut, password, telefono } = await request.json();

    if (!nombre || !rut || !password || !telefono) {
      return new Response(JSON.stringify({ error: 'Faltan nombre, rut, contraseña o teléfono' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (password.length < 6) {
      return new Response(JSON.stringify({ error: 'La contraseña debe tener al menos 6 caracteres' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const cliente = await registrarCliente({ nombre, rut, password, telefono });
    return new Response(JSON.stringify({ ok: true, cliente }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'Error al registrar' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}