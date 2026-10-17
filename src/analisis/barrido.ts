import type { CampoEntrada, Entrada } from '../simulacion/campos';
import { simular } from '../simulacion/simular';
import { ErrorEntrada } from '../simulacion/validacion';
import { METRICAS_HASTA_APOGEO } from './metricas';

/** Límite de puntos de un barrido, para que no tarde demasiado. */
export const PUNTOS_MAXIMOS = 200;

export interface PuntoBarrido {
  valor: number;                  // valor del parámetro barrido, SI
  metricas: Record<string, number> | null; // por id de METRICAS_HASTA_APOGEO; null si la entrada no es válida
  despega: boolean;
  error: string | null;           // motivo por el que no se ha podido simular
}

/** n valores equiespaciados entre `desde` y `hasta`, ambos incluidos. */
export function valoresBarrido(desde: number, hasta: number, n: number): number[] {
  if (!Number.isInteger(n) || n < 2 || n > PUNTOS_MAXIMOS) {
    throw new RangeError(`Número de puntos fuera del rango admitido [2, ${PUNTOS_MAXIMOS}]: ${n}`);
  }
  if (!Number.isFinite(desde) || !Number.isFinite(hasta) || desde === hasta) {
    throw new RangeError(`Intervalo no válido: [${desde}, ${hasta}]`);
  }
  // Los extremos exactos, sin el error de redondeo de sumar el paso.
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? hasta : desde + ((hasta - desde) * i) / (n - 1)));
}

/**
 * Simula la entrada para cada valor del campo y recoge las métricas que se conocen en el
 * apogeo. Cada simulación termina en el apogeo balístico para ir más rápido.
 * @param alAvanzar se llama tras cada punto con el número de puntos hechos
 */
export function barrer(
  entrada: Entrada,
  campo: CampoEntrada,
  valores: readonly number[],
  alAvanzar?: (hechos: number) => void,
): PuntoBarrido[] {
  return valores.map((valor, i) => {
    const { cohete, opciones } = campo.escribir(entrada, valor);
    let punto: PuntoBarrido;
    try {
      const r = simular(cohete, { ...opciones, detenerEnApogeo: true });
      const metricas: Record<string, number> = {};
      for (const m of METRICAS_HASTA_APOGEO) metricas[m.id] = m.valor(r);
      punto = { valor, metricas, despega: r.despega, error: null };
    } catch (e) {
      if (!(e instanceof ErrorEntrada)) throw e;
      punto = { valor, metricas: null, despega: false, error: e.errores.map((x) => x.mensaje).join('; ') };
    }
    alAvanzar?.(i + 1);
    return punto;
  });
}
