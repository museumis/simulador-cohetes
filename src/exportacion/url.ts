import { CAMPOS_ENTRADA, CAMPOS_TABLA, copiarEntrada, tablaATexto, textoATabla, type Entrada } from '../simulacion/campos';
import type { MetodoIntegracion, ModeloVuelo, TipoAtmosfera } from '../simulacion/tipos';

/** Versión de la codificación; cambia si cambia el significado de algún parámetro. */
export const VERSION_URL = '1';

/**
 * Codifica la entrada en los parámetros de una URL (sin el «?»). Los números se escriben con
 * String(), que en JavaScript da el double exacto: la simulación se reproduce bit a bit.
 * Las opciones que solo usan los tests (interruptores físicos, estado inicial) no se incluyen.
 */
export function codificarURL(entrada: Entrada): string {
  const p = new URLSearchParams();
  p.set('v', VERSION_URL);
  p.set('nombre', entrada.cohete.nombre);
  for (const c of CAMPOS_ENTRADA) p.set(c.clave, String(c.leer(entrada)));
  for (const c of CAMPOS_TABLA) p.set(c.clave, tablaATexto(c.leer(entrada)));
  p.set('modelo', entrada.opciones.modelo);
  p.set('metodo', entrada.opciones.metodo);
  p.set('atm', entrada.opciones.atmosfera);
  p.set('rot', entrada.opciones.rotacion ? '1' : '0');
  return p.toString();
}

/**
 * Lee la entrada de los parámetros de una URL. Los datos que falten (p. ej. la maniobra en un
 * enlace anterior al modelo 2D) se toman de `base`, salvo los que cambiarían el resultado de un
 * enlace antiguo: sin «modelo» se lee en 1D, sin «atm» con la atmósfera exponencial, sin «rot»
 * sin rotación y sin tablas con Cd constante y empuje nominal, aunque la base sea otra. Un
 * número ilegible queda como NaN para que la validación lo señale en su campo.
 * @param consulta texto de location.search, con o sin el «?»
 * @returns null si la URL no lleva una simulación
 */
export function decodificarURL(consulta: string, base: Entrada): Entrada | null {
  const p = new URLSearchParams(consulta);
  if (p.get('v') !== VERSION_URL) return null;
  let entrada = copiarEntrada(base);
  const nombre = p.get('nombre');
  if (nombre !== null) entrada.cohete.nombre = nombre;
  for (const c of CAMPOS_ENTRADA) {
    const texto = p.get(c.clave);
    if (texto !== null) entrada = c.escribir(entrada, texto.trim() === '' ? Number.NaN : Number(texto));
  }
  for (const c of CAMPOS_TABLA) entrada = c.escribir(entrada, textoATabla(p.get(c.clave) ?? ''));
  entrada.opciones.modelo = (p.get('modelo') ?? '1D') as ModeloVuelo;
  entrada.opciones.atmosfera = (p.get('atm') ?? 'exponencial') as TipoAtmosfera;
  entrada.opciones.rotacion = p.get('rot') === '1';
  const metodo = p.get('metodo');
  if (metodo !== null) entrada.opciones.metodo = metodo as MetodoIntegracion;
  return entrada;
}
