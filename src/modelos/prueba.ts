import type { Cohete } from '../simulacion/tipos';

/**
 * Cohete de sondeo de dos etapas con valores redondos. No es un cohete real.
 * TWR al despegue ≈ 1,77; apogeo de varios cientos de km.
 * Los tests de la simulación usan estos mismos valores.
 */
export const COHETE_PRUEBA: Cohete = {
  nombre: 'Cohete de prueba',
  etapas: [
    {
      masaSeca: 2_000,
      masaPropelente: 8_000,
      empujeVacio: 250_000,
      ispNivelMar: 230,
      ispVacio: 260,
      diametro: 1,
      longitud: 12,
      cd: 0.4,
    },
    {
      masaSeca: 500,
      masaPropelente: 1_000,
      empujeVacio: 50_000,
      ispNivelMar: 280,
      ispVacio: 300,
      diametro: 0.8,
      longitud: 5,
      cd: 0.35,
    },
  ],
  masaCargaUtil: 200,
  pausaSeparacion: 2,
};
