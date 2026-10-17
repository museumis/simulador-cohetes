import { G0, MU_TIERRA, RADIO_TIERRA } from './constantes';

/** Altitud mínima del perigeo para considerar que se ha alcanzado la órbita (m). */
export const ALTITUD_PERIGEO_ORBITA = 100_000;

/** Elementos orbitales instantáneos de un movimiento en el plano alrededor de la Tierra. */
export interface ElementosOrbitales {
  energia: number;        // J/kg, ε = v²/2 − μ/r
  momentoAngular: number; // m²/s, |r⃗ × v⃗|
  semiejeMayor: number;   // m, −μ / (2ε); negativo en una hipérbola, ∞ en una parábola
  excentricidad: number;  // adimensional
  altitudPerigeo: number; // m, rp − R
  altitudApogeo: number;  // m, ra − R; ∞ si la trayectoria no es cerrada
}

/**
 * Elementos orbitales a partir de la posición y la velocidad, con origen en el centro de la Tierra
 * (docs/FISICA.md § Modelo 2D). El perigeo se calcula como p / (1 + e), con p = h²/μ, que vale para
 * cualquier cónica y no pierde precisión en las órbitas casi circulares.
 * @param x posición (m)
 * @param y posición (m)
 * @param vx velocidad (m/s)
 * @param vy velocidad (m/s)
 */
export function elementosOrbitales(x: number, y: number, vx: number, vy: number): ElementosOrbitales {
  const r = Math.sqrt(x * x + y * y);
  const v2 = vx * vx + vy * vy;
  const energia = v2 / 2 - MU_TIERRA / r;
  const momentoAngular = Math.abs(x * vy - y * vx);
  const semiLado = (momentoAngular * momentoAngular) / MU_TIERRA; // p, semilado recto (m)
  // El radicando puede salir ligeramente negativo por redondeo en una órbita circular.
  const excentricidad = Math.sqrt(Math.max(0, 1 + (2 * energia * momentoAngular * momentoAngular) / (MU_TIERRA * MU_TIERRA)));
  const rp = semiLado / (1 + excentricidad);
  const ra = excentricidad < 1 ? semiLado / (1 - excentricidad) : Infinity;
  return {
    energia,
    momentoAngular,
    semiejeMayor: energia !== 0 ? -MU_TIERRA / (2 * energia) : Infinity,
    excentricidad,
    altitudPerigeo: rp - RADIO_TIERRA,
    altitudApogeo: ra - RADIO_TIERRA,
  };
}

/**
 * Periodo de una órbita cerrada: T = 2π · √(a³/μ).
 * @param semiejeMayor a (m), positivo
 * @returns periodo (s)
 */
export function periodoOrbital(semiejeMayor: number): number {
  return 2 * Math.PI * Math.sqrt((semiejeMayor * semiejeMayor * semiejeMayor) / MU_TIERRA);
}

/**
 * Margen hasta la órbita: positivo si y solo si ε < 0 y el perigeo supera ALTITUD_PERIGEO_ORBITA.
 * Es el mínimo de dos funciones continuas, así que su cero marca el instante en que se alcanza la
 * órbita. La energía se divide por g0 solo para darle unidades de longitud.
 * @returns margen (m)
 */
export function margenOrbita(e: ElementosOrbitales): number {
  return Math.min(e.altitudPerigeo - ALTITUD_PERIGEO_ORBITA, -e.energia / G0);
}
