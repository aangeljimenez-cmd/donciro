// src/lib/rut.js
//
// Utilidades para validar y normalizar RUT chileno.
// Formato canónico que se guarda en la base de datos y contra el que se
// compara en todas las consultas: "12345678-9" o "12345678-K"
// (sin puntos, un solo guión, verificador siempre en mayúscula).

const REGEX_RUT_VALIDO = /^\d{7,8}-[0-9K]$/;

/**
 * Limpia un RUT ingresado en cualquier formato (con o sin puntos, con o sin
 * guión, verificador en minúscula, con espacios) y lo deja en formato
 * canónico "12345678-9". Solo normaliza la forma, no valida el dígito
 * verificador.
 */
export function normalizarRut(rut) {
  if (rut === null || rut === undefined) return '';

  const limpio = String(rut)
    .replace(/[.\s]/g, '') // quita puntos y espacios
    .replace(/-/g, '')     // quita cualquier guión existente para reconstruir uno solo
    .toUpperCase();

  if (limpio.length === 0) return '';
  if (limpio.length === 1) return limpio; // aún no hay cuerpo, solo un carácter

  const cuerpo = limpio.slice(0, -1);
  const verificador = limpio.slice(-1);

  return `${cuerpo}-${verificador}`;
}

/** True si, ya normalizado, el RUT tiene una forma válida (7-8 dígitos + '-' + dígito o K). */
export function formatoRutValido(rut) {
  return REGEX_RUT_VALIDO.test(normalizarRut(rut));
}

/**
 * Filtra en vivo lo que el usuario va escribiendo en un <input>: antes del
 * guión solo deja pasar dígitos, y después del guión solo un carácter (dígito
 * o K/k, que se muestra en mayúscula). Pensada para usarse en el evento
 * "input" del navegador, reasignando input.value con el resultado.
 */
export function sanitizarRutEnVivo(valor) {
  if (!valor) return '';

  const primerGuionIdx = valor.indexOf('-');
  const cuerpoBruto = primerGuionIdx === -1 ? valor : valor.slice(0, primerGuionIdx);
  const verificadorBruto = primerGuionIdx === -1 ? '' : valor.slice(primerGuionIdx + 1);

  const cuerpo = cuerpoBruto.replace(/\D/g, '').slice(0, 8);

  // El usuario todavía no ha escrito el guión: no se lo agregamos nosotros,
  // para no pelear con el cursor mientras tipea.
  if (primerGuionIdx === -1) {
    return cuerpo;
  }

  const verificador = verificadorBruto.replace(/[^0-9kK]/g, '').slice(0, 1).toUpperCase();
  return `${cuerpo}-${verificador}`;
}

/**
 * Bonus opcional: valida el dígito verificador real de un RUT chileno con el
 * algoritmo módulo 11. No se usa en ningún flujo por defecto (hoy solo se
 * exige formato válido); actívala donde quieras si además quieres rechazar
 * RUTs con verificador incorrecto.
 */
export function digitoVerificadorValido(rut) {
  const normalizado = normalizarRut(rut);
  if (!formatoRutValido(normalizado)) return false;

  const [cuerpo, verificador] = normalizado.split('-');
  let suma = 0;
  let multiplicador = 2;

  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * multiplicador;
    multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
  }

  const resto = 11 - (suma % 11);
  const dvEsperado = resto === 11 ? '0' : resto === 10 ? 'K' : String(resto);

  return dvEsperado === verificador;
}