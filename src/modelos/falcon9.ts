import type { Cohete } from '../simulacion/tipos';

/**
 * Falcon 9 Block 5 (SpaceX), datos públicos aproximados.
 *
 * Fuentes:
 * - Wikipedia, «Falcon 9 Block 5» (consultada en octubre de 2026): altura, diámetro, masas vacía
 *   y bruta de cada etapa, empuje a nivel del mar de la etapa 1 (7 607 kN) y empuje de la etapa 2
 *   (934 kN), carga útil a LEO con recuperación (18 500 kg).
 * - Wikipedia, «SpaceX Merlin»: Merlin 1D, Isp 282 s a nivel del mar y 311 s en vacío,
 *   845 kN a nivel del mar y 914 kN en vacío por motor (× 9 → 8 227 kN); Merlin 1D Vacuum,
 *   Isp 348 s.
 *
 * Simplificaciones:
 * - Propelente = masa bruta − masa vacía. Empuje constante (sin regulación).
 * - La etapa 2 se enciende fuera de la atmósfera, así que su Isp a nivel del mar no interviene;
 *   se toma 200 s como valor nominal de una tobera de vacío.
 * - Longitud de la etapa 2: 13,8 m de etapa + 13,1 m de cofia; diámetro de 3,7 m (la cofia,
 *   de 5,2 m, no se modela). Coeficientes de arrastre estimados.
 * - Carga útil de 15 000 kg, por debajo del máximo.
 */
export const FALCON_9: Cohete = {
  nombre: 'Falcon 9 Block 5',
  etapas: [
    {
      masaSeca: 22_200,
      masaPropelente: 410_900,
      empujeVacio: 8_227_000,
      ispNivelMar: 282,
      ispVacio: 311,
      diametro: 3.7,
      longitud: 41.2,
      cd: 0.3,
    },
    {
      masaSeca: 4_000,
      masaPropelente: 107_500,
      empujeVacio: 934_000,
      ispNivelMar: 200,
      ispVacio: 348,
      diametro: 3.7,
      longitud: 26.9,
      cd: 0.3,
    },
  ],
  masaCargaUtil: 15_000,
  pausaSeparacion: 7,
};
