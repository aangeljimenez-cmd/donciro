// src/pages/api/checkout.js
import { crearPedido } from '../../lib/pedidos.js';

export const prerender = false;

export async function POST({ request }) {
  try {
    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > 50_000) {
      return new Response(JSON.stringify({ error: 'La solicitud es demasiado grande.' }), {
        status: 413,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const body = await request.json();
    const pedido = await crearPedido(body);
    return new Response(JSON.stringify(pedido), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const esErrorDeCliente = err instanceof SyntaxError || (
      err instanceof Error && /^(Faltan datos|El RUT |El carrito |Producto |Stock insuficiente|".+"|La solicitud)/.test(err.message)
    );
    const mensaje = err instanceof SyntaxError
      ? 'La solicitud no contiene JSON válido.'
      : esErrorDeCliente ? err.message : 'No se pudo procesar la compra. Inténtalo nuevamente.';

    // Si no es un error "esperado" de validación, lo dejamos en el log del
    // servidor para poder diagnosticarlo (antes se perdía por completo).
    if (!esErrorDeCliente && !(err instanceof SyntaxError)) {
      console.error('Error inesperado en checkout:', err);
    }

    return new Response(JSON.stringify({ error: mensaje }), {
      status: err instanceof SyntaxError ? 400 : esErrorDeCliente ? 422 : 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}