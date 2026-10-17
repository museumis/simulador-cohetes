import { COHETE_PRUEBA } from '../../src/modelos/prueba';
import type { Cohete } from '../../src/simulacion/tipos';

export { COHETE_PRUEBA };

/** Copia del cohete de prueba con cambios en una etapa. */
export function conEtapa(indice: 0 | 1, cambios: Partial<Cohete['etapas'][0]>, base: Cohete = COHETE_PRUEBA): Cohete {
  const etapas: Cohete['etapas'] = [{ ...base.etapas[0] }, { ...base.etapas[1] }];
  etapas[indice] = { ...etapas[indice], ...cambios };
  return { ...base, etapas };
}
