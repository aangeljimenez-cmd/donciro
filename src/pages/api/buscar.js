import { buscarClientePorRut } from '../../../lib/pedidos.js';

export const prerender = false;

export async function GET({ url }) {
  const rut = url.searchParams.get('rut');

  if (!rut) {
    return new Response(JSON.stringify({ error: 'Falta el parámetro rut' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const cliente = await buscarClientePorRut(rut);

  return new Response(JSON.stringify({ cliente }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}