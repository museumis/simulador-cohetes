import { masasCombustion, type MasasEtapa } from './masas';
import { velocidadExpulsion } from './motor';

/** Etapa con los datos que necesita la ecuación de Tsiolkovski. */
export interface EtapaTsiolkovski extends MasasEtapa {
  ispVacio: number; // s
}

/** Δv ideal de cada etapa y total. */
export interface DeltaVEtapas {
  etapa1: number; // m/s
  etapa2: number; // m/s
  total: number;  // m/s
}

/**
 * Ecuación de Tsiolkovski: Δv = u · ln(m0 / mf).
 * Si no se consume masa (m0 = mf), Δv = 0.
 * @param velocidadExpulsion u (m/s)
 * @param masaInicial m0 (kg)
 * @param masaFinal mf (kg)
 * @returns Δv (m/s)
 */
export function deltaV(velocidadExpulsion: number, masaInicial: number, masaFinal: number): number {
  if (masaInicial === masaFinal) return 0;
  if (!(masaFinal > 0) || !(masaInicial > masaFinal)) {
    throw new RangeError(
      `Masas no válidas para Tsiolkovski: m0 = ${masaInicial} kg, mf = ${masaFinal} kg (se requiere m0 ≥ mf > 0)`,
    );
  }
  return velocidadExpulsion * Math.log(masaInicial / masaFinal);
}

/**
 * Δv ideal por etapa y total. Cada etapa usa su propio Isp de vacío.
 * @param masaCargaUtil (kg)
 */
export function deltaVEtapas(
  etapas: readonly [EtapaTsiolkovski, EtapaTsiolkovski],
  masaCargaUtil: number,
): DeltaVEtapas {
  const [m1, m2] = masasCombustion(etapas, masaCargaUtil);
  const etapa1 = deltaV(velocidadExpulsion(etapas[0].ispVacio), m1.inicial, m1.final);
  const etapa2 = deltaV(velocidadExpulsion(etapas[1].ispVacio), m2.inicial, m2.final);
  return { etapa1, etapa2, total: etapa1 + etapa2 };
}
