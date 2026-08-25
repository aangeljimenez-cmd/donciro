// src/pages/api/clientes/buscar.js
import { buscarClienteParaRegistro } from '../../../lib/clientes.js';

export const prerender = false;

export async function GET({ url }) {
  const rut = url.searchParams.get('rut');

  if (!rut) {
    return new Response(JSON.stringify({ error: 'Falta el parámetro rut' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const resultado = await buscarClienteParaRegistro(rut);

  return new Response(JSON.stringify(resultado), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}