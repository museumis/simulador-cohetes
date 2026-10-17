import type { Cohete } from '../simulacion/tipos';
import { ELECTRON } from './electron';
import { FALCON_9 } from './falcon9';
import { COHETE_PRUEBA } from './prueba';

export interface Modelo {
  id: string;
  cohete: Cohete;
}

/** Cohetes predefinidos, en el orden en que aparecen en el selector. */
export const MODELOS: readonly Modelo[] = [
  { id: 'prueba', cohete: COHETE_PRUEBA },
  { id: 'falcon9', cohete: FALCON_9 },
  { id: 'electron', cohete: ELECTRON },
];

/** Copia profunda de un cohete, para editarla sin tocar el modelo. */
export function copiarCohete(cohete: Cohete): Cohete {
  return { ...cohete, etapas: [{ ...cohete.etapas[0] }, { ...cohete.etapas[1] }] };
}
