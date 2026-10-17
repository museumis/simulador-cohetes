import type { Cohete } from '../simulacion/tipos';

/**
 * Electron (Rocket Lab), datos públicos aproximados.
 *
 * Fuentes:
 * - Wikipedia, «Electron (rocket)» (consultada en octubre de 2026): altura y diámetro de cada
 *   etapa, empuje de la etapa 1 (224,3 kN a nivel del mar, 234 kN en vacío) e Isp de 311 s,
 *   empuje de la etapa 2 (25,8 kN) e Isp de 343 s, masa al despegue de 13,0 t, cofia de 2,5 m
 *   y carga útil a LEO de 300 kg.
 *
 * Estimaciones propias (no publicadas por etapa):
 * - Masas seca y de propelente de cada etapa, repartidas para sumar 13,0 t al despegue.
 * - Isp a nivel del mar de la etapa 1: 311 s × 224,3 / 234 ≈ 298 s (mismo caudal en los dos
 *   regímenes). Isp a nivel del mar de la etapa 2: valor nominal, se enciende fuera de la
 *   atmósfera.
 * - Longitud de la etapa 2: 2,4 m de etapa + 2,5 m de cofia. Coeficientes de arrastre.
 * - Maniobra de inclinación ajustada con el modelo 2D (sin rotación terrestre ni etapa de
 *   apogeo): 9,5° a 60 m/s dejan la etapa 2 en una órbita de unos 170 × 228 km.
 */
export const ELECTRON: Cohete = {
  nombre: 'Electron',
  etapas: [
    {
      masaSeca: 950,
      masaPropelente: 9_250,
      empujeVacio: 234_000,
      ispNivelMar: 298,
      ispVacio: 311,
      diametro: 1.2,
      longitud: 12.1,
      cd: 0.35,
    },
    {
      masaSeca: 250,
      masaPropelente: 2_250,
      empujeVacio: 25_800,
      ispNivelMar: 250,
      ispVacio: 343,
      diametro: 1.2,
      longitud: 4.9,
      cd: 0.35,
    },
  ],
  masaCargaUtil: 300,
  pausaSeparacion: 3,
  velocidadManiobra: 60,
  anguloManiobra: 9.5,
};
