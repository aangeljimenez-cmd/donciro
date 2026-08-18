// src/pages/api/ordenes/[id]/confirmar.ts
//
// El vendedor ya pesó los productos que correspondía; este endpoint
// calcula el total real, crea la orden de pago en Flow y guarda el
// link generado, para mostrarlo en el panel (no se redirige a nadie).

import type { APIRoute } from "astro";
import { confirmarPesosYCalcularTotal, guardarLinkPago } from "../../../../lib/db";
import { crearLinkDePago } from "../../../../lib/mercadopago";

export const prerender = false;

export const POST: APIRoute = async ({ params, request, url }) => {
  const ordenId = Number(params.id);
  if (Number.isNaN(ordenId)) {
    return new Response(JSON.stringify({ error: "Id inválido" }), { status: 400 });
  }

  try {
    const body = await request.json();
    const pesos: Record<number, number> = body?.pesos ?? {};
    const email: string | null = body?.email || null;

    if (!email) {
      return new Response(JSON.stringify({ error: "Falta el email del cliente para generar el link" }), {
        status: 400,
      });
    }

    const total = confirmarPesosYCalcularTotal(ordenId, pesos, email);

    if (total <= 0) {
      return new Response(JSON.stringify({ error: "El total del pedido es inválido" }), { status: 400 });
    }

    const link = await crearLinkDePago({ ordenId, total, email, origin: url.origin });
    guardarLinkPago(ordenId, link);

    return new Response(JSON.stringify({ link, total }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(`Error confirmando orden ${ordenId}:`, err);
    const mensaje = err instanceof Error ? err.message : "No se pudo confirmar el pedido";
    return new Response(JSON.stringify({ error: mensaje }), { status: 500 });
  }
};