// Formato de números para la interfaz. Sin DOM: se prueba con Vitest.

/** Separador de miles: espacio estrecho sin salto (ISO 80000-1). */
export const SEPARADOR_MILES = '\u202f';

/** Texto que se muestra cuando un valor no es finito. */
export const SIN_VALOR = '—';

/** Exponentes decimales a partir de los cuales se usa notación científica. */
const EXPONENTE_MAXIMO = 7;  // |x| ≥ 1e7
const EXPONENTE_MINIMO = -2; // |x| < 1e-2

function agruparMiles(entera: string): string {
  const signo = entera.startsWith('-') ? '-' : '';
  const digitos = signo ? entera.slice(1) : entera;
  if (digitos.length < 4) return entera;
  let resultado = '';
  for (let i = 0; i < digitos.length; i++) {
    if (i > 0 && (digitos.length - i) % 3 === 0) resultado += SEPARADOR_MILES;
    resultado += digitos[i];
  }
  return signo + resultado;
}

function unir(texto: string): string {
  const [entera = '', fraccion] = texto.split('.');
  return fraccion === undefined ? agruparMiles(entera) : `${agruparMiles(entera)}.${fraccion}`;
}

/**
 * Formatea un número con un número fijo de cifras significativas.
 * Usa punto decimal, agrupa los miles con un espacio estrecho y pasa a notación
 * científica (p. ej. 1.381e-3) fuera de [1e-2, 1e7).
 * @param cifras cifras significativas (≥ 1)
 */
export function formatearNumero(valor: number, cifras = 4): string {
  if (!Number.isFinite(valor)) return SIN_VALOR;
  if (valor === 0) return cifras > 1 ? `0.${'0'.repeat(cifras - 1)}` : '0';
  // El exponente se toma del valor ya redondeado: 9.9996 con 4 cifras es 10.00.
  const redondeado = Number(valor.toPrecision(cifras));
  const exponente = Math.floor(Math.log10(Math.abs(redondeado)));
  if (exponente >= EXPONENTE_MAXIMO || exponente < EXPONENTE_MINIMO) {
    const [mantisa, exp] = valor.toExponential(cifras - 1).split('e');
    return `${mantisa}e${Number(exp)}`;
  }
  return unir(valor.toFixed(Math.max(0, cifras - 1 - exponente)));
}

/**
 * Formatea con un número fijo de decimales, agrupando los miles.
 * Para tiempos (T+ con milisegundos) y valores con resolución absoluta.
 */
export function formatearFijo(valor: number, decimales: number): string {
  if (!Number.isFinite(valor)) return SIN_VALOR;
  return unir(valor.toFixed(decimales));
}

/**
 * Divide un número formateado en la parte anterior al punto decimal y el resto, para
 * alinear columnas por el punto. En notación científica sin punto, el exponente va en el resto.
 */
export function partirPorPunto(texto: string): [string, string] {
  const punto = texto.indexOf('.');
  if (punto >= 0) return [texto.slice(0, punto), texto.slice(punto)];
  const e = texto.indexOf('e');
  if (e >= 0) return [texto.slice(0, e), texto.slice(e)];
  return [texto, ''];
}
