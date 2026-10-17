import type { Cohete } from '../../src/simulacion/tipos';

/**
 * Cohete de sondeo de dos etapas con valores redondos para los tests.
 * TWR al despegue ≈ 1,77; apogeo de varios cientos de km.
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
      cd: 0.4,
    },
    {
      masaSeca: 500,
      masaPropelente: 1_000,
      empujeVacio: 50_000,
      ispNivelMar: 280,
      ispVacio: 300,
      diametro: 0.8,
      cd: 0.35,
    },
  ],
  masaCargaUtil: 200,
  pausaSeparacion: 2,
};

/** Copia del cohete de prueba con cambios en una etapa. */
export function conEtapa(indice: 0 | 1, cambios: Partial<Cohete['etapas'][0]>, base: Cohete = COHETE_PRUEBA): Cohete {
  const etapas: Cohete['etapas'] = [{ ...base.etapas[0] }, { ...base.etapas[1] }];
  etapas[indice] = { ...etapas[indice], ...cambios };
  return { ...base, etapas };
}
