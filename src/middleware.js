export const onRequest = async (context, next) => {
  const { request, url } = context;

  const rutasProtegidas = ['/pedidos', '/api/pesaje', '/api/estado'];
  const requiereAuth = rutasProtegidas.some((ruta) => url.pathname.startsWith(ruta));

  if (!requiereAuth) return next();

  const header = request.headers.get('authorization') || '';
  if (!header.startsWith('Basic ')) {
    return new Response('Autenticación requerida', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="Panel proveedor"' },
    });
  }

  const [user, pass] = atob(header.slice(6)).split(':');
  const autenticado = user === import.meta.env.PROVEEDOR_USER && pass === import.meta.env.PROVEEDOR_PASS;

  if (!autenticado) {
    return new Response('Autenticación requerida', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="Panel proveedor"' },
    });
  }

  return next();
};