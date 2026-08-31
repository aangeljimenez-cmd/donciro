// src/lib/rateLimit.js
//
// Rate limiting simple en memoria para endpoints sensibles (login de
// clientes, panel proveedor). Funciona bien mientras la app corra como un
// solo proceso Node (que es el caso en Railway, modo standalone). Si en el
// futuro se despliega en varias instancias en paralelo, esto debe migrarse
// a un almacén compartido (ej. Redis), porque cada instancia tendría su
// propio conteo.

const intentos = new Map(); // clave -> { conteo, primerIntento, bloqueadoHasta }

const VENTANA_MS = 15 * 60 * 1000;   // ventana para contar intentos: 15 min
const MAX_INTENTOS = 5;               // intentos fallidos permitidos en la ventana
const BLOQUEO_MS = 15 * 60 * 1000;    // tiempo de bloqueo tras superar el máximo

// Limpieza periódica para no acumular memoria indefinidamente.
const limpieza = setInterval(() => {
  const ahora = Date.now();
  for (const [clave, datos] of intentos) {
    const expiro = datos.bloqueadoHasta
      ? datos.bloqueadoHasta < ahora
      : ahora - datos.primerIntento > VENTANA_MS;
    if (expiro) intentos.delete(clave);
  }
}, 5 * 60 * 1000);
limpieza.unref?.(); // no debe mantener vivo el proceso solo por este timer

/**
 * Verifica si `clave` (ej. "login:IP:RUT") puede intentar de nuevo.
 * Devuelve { permitido: true } o { permitido: false, segundosRestantes }.
 */
export function verificarLimite(clave) {
  const ahora = Date.now();
  const datos = intentos.get(clave);
  if (!datos) return { permitido: true };

  if (datos.bloqueadoHasta) {
    if (ahora < datos.bloqueadoHasta) {
      return { permitido: false, segundosRestantes: Math.ceil((datos.bloqueadoHasta - ahora) / 1000) };
    }
    intentos.delete(clave); // el bloqueo ya expiró
    return { permitido: true };
  }

  if (ahora - datos.primerIntento > VENTANA_MS) {
    intentos.delete(clave); // salió de la ventana de conteo
    return { permitido: true };
  }

  return { permitido: true };
}

/** Registra un intento fallido. Si supera el máximo, bloquea la clave. */
export function registrarIntentoFallido(clave) {
  const ahora = Date.now();
  const datos = intentos.get(clave);

  if (!datos || ahora - datos.primerIntento > VENTANA_MS) {
    intentos.set(clave, { conteo: 1, primerIntento: ahora, bloqueadoHasta: null });
    return;
  }

  const nuevoConteo = datos.conteo + 1;
  intentos.set(clave, {
    conteo: nuevoConteo,
    primerIntento: datos.primerIntento,
    bloqueadoHasta: nuevoConteo >= MAX_INTENTOS ? ahora + BLOQUEO_MS : null,
  });
}

/** Limpia los intentos de una clave (ej. tras un login exitoso). */
export function limpiarIntentos(clave) {
  intentos.delete(clave);
}

/** Extrae la IP real del cliente, priorizando X-Forwarded-For (Railway usa proxy). */
export function obtenerIp(request, clientAddress) {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return clientAddress || 'desconocida';
}