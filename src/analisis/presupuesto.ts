import type { Muestra } from '../simulacion/tipos';

/** Presupuesto de Δv acumulado hasta un instante (docs/FISICA.md § Pérdidas de Δv). Todo en m/s. */
export interface PresupuestoDeltaV {
  ideal: number;
  gravedad: number;
  arrastre: number;
  contrapresion: number;
  direccion: number;
  /** Δv ideal menos todas las pérdidas. */
  resultante: number;
  /** Lo que de verdad ha ganado el cohete: |v| − |v0|. */
  real: number;
  /** real − resultante: cero salvo error numérico mientras la identidad es aplicable. */
  cierre: number;
  /**
   * La identidad solo vale mientras el cohete no ha empezado a caer: en el descenso el
   * arrastre empuja hacia arriba y la gravedad acelera, y |v| deja de ser la suma con signo.
   */
  aplicable: boolean;
}

/**
 * Instante a partir del cual el presupuesto deja de ser aplicable: el de la última muestra
 * antes de la primera con v < 0 (en el apogeo v = 0 exacto). Infinity si nunca cae.
 * @param muestras ordenadas por t
 */
export function finAscenso(muestras: readonly Muestra[]): number {
  for (let i = 0; i < muestras.length; i++) {
    if (muestras[i]!.velocidad < 0) return i > 0 ? muestras[i - 1]!.t : -Infinity;
  }
  return Infinity;
}

/**
 * Presupuesto de Δv en el estado `m`.
 * @param v0 velocidad inicial del vuelo (m/s)
 * @param tFinAscenso resultado de finAscenso para el mismo vuelo (s)
 */
export function presupuestoDeltaV(m: Muestra, v0: number, tFinAscenso: number): PresupuestoDeltaV {
  const p = m.perdidas;
  const resultante = m.deltaVIdeal - p.gravedad - p.arrastre - p.contrapresion - p.direccion;
  const real = Math.abs(m.velocidad) - Math.abs(v0);
  return {
    ideal: m.deltaVIdeal,
    gravedad: p.gravedad,
    arrastre: p.arrastre,
    contrapresion: p.contrapresion,
    direccion: p.direccion,
    resultante,
    real,
    cierre: real - resultante,
    aplicable: m.t <= tFinAscenso,
  };
}
