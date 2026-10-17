import type { Entrada } from '../simulacion/campos';
import { ORDEN_METODO } from '../simulacion/integrador';
import { simular } from '../simulacion/simular';
import type { MetodoIntegracion } from '../simulacion/tipos';
import { DT_MINIMO } from '../simulacion/validacion';
import { METRICAS } from './metricas';

/** Extrapolación de Richardson de una magnitud calculada con pasos dt y dt/2. */
export interface Extrapolacion {
  /** Error estimado del valor con dt: x(dt) − x exacto ≈ (x(dt) − x(dt/2)) · 2ᵖ / (2ᵖ − 1). */
  error: number;
  /** Estimación del valor exacto: x(dt/2) + (x(dt/2) − x(dt)) / (2ᵖ − 1). */
  extrapolado: number;
}

/**
 * Richardson para un método de orden p: si x(h) = X + C·hᵖ, las dos simulaciones permiten
 * despejar C·hᵖ (el error de x(dt)) y X.
 */
export function extrapolarRichardson(x: number, xMitad: number, orden: number): Extrapolacion {
  const k = 2 ** orden - 1;
  return { error: ((x - xMitad) * (k + 1)) / k, extrapolado: xMitad + (xMitad - x) / k };
}

/**
 * Orden de convergencia observado con dt, dt/2 y dt/4: log₂((x₁ − x₂) / (x₂ − x₃)).
 * NaN si las diferencias no tienen el mismo signo (error dominado por el redondeo).
 */
export function ordenObservado(x1: number, x2: number, x3: number): number {
  const d1 = x1 - x2;
  const d2 = x2 - x3;
  if (!(d1 * d2 > 0)) return Number.NaN;
  return Math.log2(d1 / d2);
}

/** Sin funciones, para poder enviarla desde un Web Worker. */
export interface FilaRichardson {
  metrica: string;                   // id de la métrica (ver buscarMetrica)
  valores: [number, number, number]; // con dt, dt/2 y dt/4
  error: number;                     // estimado de valores[0]
  extrapolado: number;
  ordenObservado: number;
}

export interface EstimacionError {
  metodo: MetodoIntegracion;
  orden: number;       // teórico
  dt: number;          // s
  filas: FilaRichardson[];
  tiempoCalculoMs: number;
}

/**
 * Estima el error de cada métrica del vuelo simulando también con dt/2 y dt/4.
 * Devuelve null si dt/4 queda por debajo del paso mínimo admitido.
 */
export function estimarError(entrada: Entrada): EstimacionError | null {
  const { cohete, opciones } = entrada;
  if (opciones.dt / 4 < DT_MINIMO) return null;
  const inicio = performance.now();
  const resultados = [1, 2, 4].map((k) => simular(cohete, { ...opciones, dt: opciones.dt / k }));
  const orden = ORDEN_METODO[opciones.metodo];
  const filas = METRICAS.map((metrica): FilaRichardson => {
    const valores = resultados.map((r) => metrica.valor(r)) as [number, number, number];
    const { error, extrapolado } = extrapolarRichardson(valores[0], valores[1], orden);
    return { metrica: metrica.id, valores, error, extrapolado, ordenObservado: ordenObservado(...valores) };
  });
  return { metodo: opciones.metodo, orden, dt: opciones.dt, filas, tiempoCalculoMs: performance.now() - inicio };
}
