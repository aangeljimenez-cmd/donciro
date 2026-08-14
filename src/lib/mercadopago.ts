// src/lib/mercadopago.ts
//
// Crea una "preferencia de pago" en MercadoPago (Checkout Pro) y devuelve
// el init_point: el link listo para compartir (WhatsApp, copiar/pegar,
// etc.). No redirige a nadie, solo entrega la URL.
//
// Variable de entorno requerida:
//   MERCADOPAGO_ACCESS_TOKEN  -> Access Token de prueba o de producción,
//                                se obtiene en developers.mercadopago.com

const MERCADOPAGO_ACCESS_TOKEN = import.meta.env.MERCADOPAGO_ACCESS_TOKEN;

export async function crearLinkDePago(opts: {
  ordenId: number;
  total: number;
  email: string;
  origin: string;
}): Promise<string> {
  const { ordenId, total, email, origin } = opts;

  const body = {
    items: [
      {
        id: String(ordenId),
        title: `Pedido #${ordenId}`,
        quantity: 1,
        currency_id: "CLP",
        unit_price: total,
      },
    ],
    payer: { email },
    back_urls: {
      success: `${origin}/carrito/gracias`,
      pending: `${origin}/carrito/gracias`,
      failure: `${origin}/carrito`,
    },
    auto_return: "approved",
    notification_url: `${origin}/api/confirmar-pago`,
    external_reference: String(ordenId),
    statement_descriptor: "TIENDA",
  };

  const respuesta = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`,
    },
    body: JSON.stringify(body),
  });

  const data = await respuesta.json();

  if (!respuesta.ok || !data.init_point) {
    console.error("Error creando preferencia en MercadoPago:", data);
    throw new Error("No se pudo generar el link de pago en MercadoPago");
  }

  // init_point = producción, sandbox_init_point = pruebas con cuenta de test
  return data.init_point;
}