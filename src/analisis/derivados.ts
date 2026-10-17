import { PRESION_NIVEL_MAR } from '../fisica/constantes';
import { gravedad } from '../fisica/gravedad';
import { fraccionCargaUtil, masaInicial, masasCombustion } from '../fisica/masas';
import { caudalMasico, empujeSegunPresion, tiempoCombustionRegulada } from '../fisica/motor';
import { deltaVEtapas } from '../fisica/tsiolkovski';
import type { Cohete } from '../simulacion/tipos';

/** Valores derivados de una etapa, calculados sin simular. */
export interface DerivadosEtapa {
  masaInicial: number;      // kg, al empezar su combustión
  masaFinal: number;        // kg, al terminarla
  caudal: number;           // kg/s, nominal (100 %)
  tiempoCombustion: number; // s, con el perfil de regulación y sin el límite de aceleración
  twrInicial: number;       // al encenderse, con g en la superficie: etapa 1 con empuje a nivel del mar, etapa 2 con empuje de vacío
  deltaVIdeal: number;      // m/s, Tsiolkovski con Isp de vacío
}

export interface Derivados {
  masaDespegue: number;      // kg
  fraccionCargaUtil: number; // adimensional
  etapas: [DerivadosEtapa, DerivadosEtapa];
  deltaVIdeal: number;       // m/s, total
}

/**
 * Valores derivados de los datos de entrada, para mostrarlos junto a la tabla de parámetros.
 * Supone un cohete válido (ver validarCohete).
 */
export function calcularDerivados(cohete: Cohete): Derivados {
  const masas = masasCombustion(cohete.etapas, cohete.masaCargaUtil);
  const dv = deltaVEtapas(cohete.etapas, cohete.masaCargaUtil);
  const g = gravedad(0);
  const etapa = (i: 0 | 1, empuje: number, deltaV: number): DerivadosEtapa => {
    const e = cohete.etapas[i];
    return {
      masaInicial: masas[i].inicial,
      masaFinal: masas[i].final,
      caudal: caudalMasico(e),
      tiempoCombustion: tiempoCombustionRegulada(e, e.masaPropelente, e.regulacion),
      twrInicial: empuje / (masas[i].inicial * g),
      deltaVIdeal: deltaV,
    };
  };
  const [e1, e2] = cohete.etapas;
  return {
    masaDespegue: masaInicial(cohete.etapas, cohete.masaCargaUtil),
    fraccionCargaUtil: fraccionCargaUtil(cohete.etapas, cohete.masaCargaUtil),
    etapas: [etapa(0, empujeSegunPresion(e1, PRESION_NIVEL_MAR), dv.etapa1), etapa(1, e2.empujeVacio, dv.etapa2)],
    deltaVIdeal: dv.total,
  };
}
