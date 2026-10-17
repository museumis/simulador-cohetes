import type { Cohete, Tabla } from '../simulacion/tipos';

/** Cd frente al Mach de las dos etapas (estimación propia, ver arriba). */
const TABLA_CD: Tabla = [[0, 0.3], [0.6, 0.3], [0.9, 0.375], [1.1, 0.495], [1.3, 0.48], [2, 0.381], [3, 0.3], [5, 0.24], [10, 0.219]];

/**
 * Falcon 9 Block 5 (SpaceX), datos públicos aproximados.
 *
 * Fuentes:
 * - Wikipedia, «Falcon 9 Block 5» (consultada en octubre de 2026): altura, diámetro, masas vacía
 *   y bruta de cada etapa, empuje a nivel del mar de la etapa 1 (7 607 kN) y empuje de la etapa 2
 *   (934 kN), carga útil a LEO sin recuperación de la etapa 1 (22 800 kg desde Cabo Cañaveral).
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
 * - Carga útil de 22 800 kg, la publicada sin recuperación: el modelo no reserva propelente para
 *   el aterrizaje.
 * - Lanzamiento desde Cabo Cañaveral (28,5° N) hacia el este: órbita de 28,5° de inclinación.
 * - Tabla Cd(Mach) con la forma típica de un cuerpo esbelto (máximo transónico de 1,65 veces el Cd
 *   subsónico hacia Mach 1,1), escalada a Cd = 0,3: estimación propia, no hay datos publicados.
 * - Sin perfil de regulación ni límite de aceleración: no se publican.
 * - Maniobra de inclinación ajustada con el modelo 2D, la US Standard Atmosphere 1976 y la rotación
 *   terrestre: 2,9° a 60 m/s dejan la etapa 2 en una órbita de unos 292 × 377 km.
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
      tablaCd: TABLA_CD,
      regulacion: [],
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
      tablaCd: TABLA_CD,
      regulacion: [],
    },
  ],
  masaCargaUtil: 22_800,
  pausaSeparacion: 7,
  velocidadManiobra: 60,
  anguloManiobra: 2.9,
  aceleracionMaxima: 0,
  latitudLanzamiento: 28.5,
  azimutLanzamiento: 90,
};
