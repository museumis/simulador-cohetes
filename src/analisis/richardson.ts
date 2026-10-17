import type { Entrada } from '../simulacion/campos';
import { esAdaptativo, ORDEN_METODO } from '../simulacion/integrador';
import { simular } from '../simulacion/simular';
import type { MetodoIntegracion } from '../simulacion/tipos';
import { DT_MINIMO, TOLERANCIA_MINIMA } from '../simulacion/validacion';
import { metricasDelModelo } from './metricas';

/** Extrapolación de Richardson de una magnitud calculada con un parámetro h y con h/r. */
export interface Extrapolacion {
  /** Error estimado del valor con h: x(h) − x exacto ≈ (x(h) − x(h/r)) · rᵖ / (rᵖ − 1). */
  error: number;
  /** Estimación del valor exacto: x(h/r) + (x(h/r) − x(h)) / (rᵖ − 1). */
  extrapolado: number;
}

/**
 * Richardson para un error de orden p en h: si x(h) = X + C·hᵖ, las dos simulaciones permiten
 * despejar C·hᵖ (el error de x(h)) y X.
 * @param razon r, cociente entre los dos valores de h (2 al dividir dt a la mitad)
 */
export function extrapolarRichardson(x: number, xRefinado: number, orden: number, razon = 2): Extrapolacion {
  const k = razon ** orden - 1;
  return { error: ((x - xRefinado) * (k + 1)) / k, extrapolado: xRefinado + (xRefinado - x) / k };
}

/**
 * Orden de convergencia observado con h, h/r y h/r²: log_r((x₁ − x₂) / (x₂ − x₃)).
 * NaN si las diferencias no tienen el mismo signo (error dominado por el redondeo).
 */
export function ordenObservado(x1: number, x2: number, x3: number, razon = 2): number {
  const d1 = x1 - x2;
  const d2 = x2 - x3;
  if (!(d1 * d2 > 0)) return Number.NaN;
  return Math.log(d1 / d2) / Math.log(razon);
}

/**
 * Refinamiento de cada tipo de método. En los de paso fijo se divide dt a la mitad y el error es
 * de orden p en dt. En los adaptativos se divide la tolerancia entre 10: el control del paso hace
 * que el error global sea aproximadamente proporcional a la tolerancia (orden 1 en ella).
 */
export const REFINAMIENTO = {
  fijo: { razon: 2 },
  adaptativo: { razon: 10, orden: 1 },
} as const;

/** Sin funciones, para poder enviarla desde un Web Worker. */
export interface FilaRichardson {
  metrica: string;                   // id de la métrica (ver buscarMetrica)
  valores: [number, number, number]; // con dt, dt/2 y dt/4 (adaptativos: tol, tol/10 y tol/100)
  error: number;                     // estimado de valores[0]
  extrapolado: number;
  ordenObservado: number;
}

export interface EstimacionError {
  metodo: MetodoIntegracion;
  adaptativo: boolean; // true: se refina la tolerancia en lugar de dt
  orden: number;       // teórico, respecto a dt (paso fijo) o a la tolerancia (adaptativo)
  razon: number;       // refinamiento entre simulaciones: 2 (dt) o 10 (tolerancia)
  dt: number;          // s
  tolerancia: number;
  filas: FilaRichardson[];
  tiempoCalculoMs: number;
}

/**
 * Estima el error de cada métrica del vuelo simulando también con dt/2 y dt/4 (paso fijo) o con
 * tol/10 y tol/100 (paso adaptativo). Devuelve null si el último refinamiento queda por debajo
 * del mínimo admitido.
 */
export function estimarError(entrada: Entrada): EstimacionError | null {
  const { cohete, opciones } = entrada;
  const adaptativo = esAdaptativo(opciones.metodo);
  const razon = adaptativo ? REFINAMIENTO.adaptativo.razon : REFINAMIENTO.fijo.razon;
  if (adaptativo ? opciones.tolerancia / razon ** 2 < TOLERANCIA_MINIMA : opciones.dt / razon ** 2 < DT_MINIMO) return null;
  const inicio = performance.now();
  const resultados = [1, razon, razon ** 2].map((k) =>
    simular(cohete, adaptativo ? { ...opciones, tolerancia: opciones.tolerancia / k } : { ...opciones, dt: opciones.dt / k }),
  );
  const orden = adaptativo ? REFINAMIENTO.adaptativo.orden : ORDEN_METODO[opciones.metodo];
  const filas = metricasDelModelo(opciones.modelo).map((metrica): FilaRichardson => {
    const valores = resultados.map((r) => metrica.valor(r)) as [number, number, number];
    const { error, extrapolado } = extrapolarRichardson(valores[0], valores[1], orden, razon);
    return { metrica: metrica.id, valores, error, extrapolado, ordenObservado: ordenObservado(...valores, razon) };
  });
  return {
    metodo: opciones.metodo,
    adaptativo,
    orden,
    razon,
    dt: opciones.dt,
    tolerancia: opciones.tolerancia,
    filas,
    tiempoCalculoMs: performance.now() - inicio,
  };
}
