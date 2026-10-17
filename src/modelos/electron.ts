import type { Cohete, Tabla } from '../simulacion/tipos';

/** Cd frente al Mach de las dos etapas (estimación propia, ver arriba). */
const TABLA_CD: Tabla = [[0, 0.35], [0.6, 0.35], [0.9, 0.438], [1.1, 0.577], [1.3, 0.56], [2, 0.444], [3, 0.35], [5, 0.28], [10, 0.256]];

/**
 * Electron (Rocket Lab), datos públicos aproximados.
 *
 * Fuentes:
 * - Wikipedia, «Electron (rocket)» (consultada en octubre de 2026): altura y diámetro de cada
 *   etapa, empuje de la etapa 1 (224,3 kN a nivel del mar, 234 kN en vacío) e Isp de 311 s,
 *   empuje de la etapa 2 (25,8 kN) e Isp de 343 s, masa al despegue de 13,0 t, cofia de 2,5 m
 *   y carga útil de 300 kg a LEO y de 200 kg a una órbita heliosíncrona de 500 km, ambas con la
 *   etapa de apogeo Curie. Lanzamientos desde el Complejo 1 (península de Mahia, 39,26° S).
 *
 * Estimaciones propias (no publicadas por etapa):
 * - Masas seca y de propelente de cada etapa, repartidas para sumar 13,0 t al despegue.
 * - Isp a nivel del mar de la etapa 1: 311 s × 224,3 / 234 ≈ 298 s (mismo caudal en los dos
 *   regímenes). Isp a nivel del mar de la etapa 2: valor nominal, se enciende fuera de la
 *   atmósfera.
 * - Longitud de la etapa 2: 2,4 m de etapa + 2,5 m de cofia. Coeficientes de arrastre y tabla
 *   Cd(Mach) con la forma típica de un cuerpo esbelto, escalada a Cd = 0,35.
 * - Carga útil de 270 kg: la etapa de apogeo Curie no se modela, y con ella la etapa 2 sola llega
 *   a órbita heliosíncrona.
 * - Azimut de 189,1°: desde 39,26° S da una órbita de 97° de inclinación (heliosíncrona),
 *   cos i = cos(latitud) · sen(azimut).
 * - Sin perfil de regulación ni límite de aceleración: no se publican.
 * - Maniobra de inclinación ajustada con el modelo 2D, la US Standard Atmosphere 1976 y la rotación
 *   terrestre: 9,25° a 60 m/s dejan la etapa 2 en una órbita de unos 225 × 575 km.
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
      tablaCd: TABLA_CD,
      regulacion: [],
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
      tablaCd: TABLA_CD,
      regulacion: [],
    },
  ],
  masaCargaUtil: 270,
  pausaSeparacion: 3,
  velocidadManiobra: 60,
  anguloManiobra: 9.25,
  aceleracionMaxima: 0,
  latitudLanzamiento: -39.26,
  azimutLanzamiento: 189.1,
};
