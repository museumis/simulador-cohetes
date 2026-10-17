/** Masas de una etapa. */
export interface MasasEtapa {
  masaSeca: number;       // kg, estructura y motores
  masaPropelente: number; // kg
}

/** Masas al principio y al final de la combustión de una etapa. */
export interface MasasCombustion {
  inicial: number; // kg
  final: number;   // kg
}

/**
 * Masa total al despegue: las dos etapas completas más la carga útil.
 * @param masaCargaUtil (kg)
 * @returns masa inicial (kg)
 */
export function masaInicial(etapas: readonly [MasasEtapa, MasasEtapa], masaCargaUtil: number): number {
  const [e1, e2] = etapas;
  return e1.masaSeca + e1.masaPropelente + e2.masaSeca + e2.masaPropelente + masaCargaUtil;
}

/**
 * Masas inicial y final de la combustión de cada etapa.
 * - Etapa 1: empieza con todo y termina sin su propelente.
 * - Etapa 2: empieza sin la etapa 1 y termina con su masa seca y la carga útil.
 */
export function masasCombustion(
  etapas: readonly [MasasEtapa, MasasEtapa],
  masaCargaUtil: number,
): [MasasCombustion, MasasCombustion] {
  const [e1, e2] = etapas;
  const inicial1 = masaInicial(etapas, masaCargaUtil);
  const inicial2 = e2.masaSeca + e2.masaPropelente + masaCargaUtil;
  return [
    { inicial: inicial1, final: inicial1 - e1.masaPropelente },
    { inicial: inicial2, final: inicial2 - e2.masaPropelente },
  ];
}

/**
 * Fracción de propelente de una etapa: propelente / (seca + propelente), sin la carga útil.
 * @returns fracción entre 0 y 1
 */
export function fraccionPropelente(etapa: MasasEtapa): number {
  return etapa.masaPropelente / (etapa.masaSeca + etapa.masaPropelente);
}

/**
 * Fracción de carga útil: carga útil / masa total al despegue.
 * @returns fracción entre 0 y 1
 */
export function fraccionCargaUtil(etapas: readonly [MasasEtapa, MasasEtapa], masaCargaUtil: number): number {
  return masaCargaUtil / masaInicial(etapas, masaCargaUtil);
}
