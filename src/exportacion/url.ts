import { CAMPOS_ENTRADA, copiarEntrada, type Entrada } from '../simulacion/campos';
import type { MetodoIntegracion, ModeloVuelo } from '../simulacion/tipos';

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
  p.set('modelo', entrada.opciones.modelo);
  p.set('metodo', entrada.opciones.metodo);
  return p.toString();
}

/**
 * Lee la entrada de los parámetros de una URL. Los datos que falten (p. ej. la maniobra y el modelo
 * en un enlace anterior al modelo 2D) se toman de `base`; un
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
  const modelo = p.get('modelo');
  if (modelo !== null) entrada.opciones.modelo = modelo as ModeloVuelo;
  const metodo = p.get('metodo');
  if (metodo !== null) entrada.opciones.metodo = metodo as MetodoIntegracion;
  return entrada;
}
