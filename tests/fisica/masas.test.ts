import { describe, it } from 'vitest';
import {
  fraccionCargaUtil,
  fraccionPropelente,
  masaInicial,
  masasCombustion,
  type MasasEtapa,
} from '../../src/fisica/masas';
import { esperarCercano } from '../ayudas';

const sinEtapa2: MasasEtapa = { masaSeca: 0, masaPropelente: 0 };
const etapas: [MasasEtapa, MasasEtapa] = [
  { masaSeca: 5_000, masaPropelente: 50_000 },
  { masaSeca: 5_000, masaPropelente: 50_000 },
];

describe('masas', () => {
  it('masa inicial: dos etapas y carga útil', () => {
    esperarCercano(masaInicial(etapas, 5_000), 115_000);
  });

  it('masas de cada combustión', () => {
    const [m1, m2] = masasCombustion(etapas, 5_000);
    esperarCercano(m1.inicial, 115_000);
    esperarCercano(m1.final, 65_000);
    esperarCercano(m2.inicial, 60_000);
    esperarCercano(m2.final, 10_000);
  });

  // Portado de getFraccionPropelenteTest. Java daba 100 000 / 115 000 = 0,8696 porque incluía
  // la carga útil (error 5). Fracción de la etapa: 100 000 / 110 000.
  it('fracción de propelente de una etapa, sin la carga útil', () => {
    esperarCercano(fraccionPropelente({ masaSeca: 10_000, masaPropelente: 100_000 }), 100_000 / 110_000);
  });

  // Portado de getFraccionCargaUtilTest: 5000 / 115 000 (coincide con Java porque no hay etapa 2).
  it('fracción de carga útil sin etapa 2', () => {
    esperarCercano(
      fraccionCargaUtil([{ masaSeca: 10_000, masaPropelente: 100_000 }, sinEtapa2], 5_000),
      0.043478260869565216,
    );
  });

  // Java solo usaba la etapa 1 y daba 5000 / 60 000 (error 5).
  it('fracción de carga útil con las dos etapas', () => {
    esperarCercano(fraccionCargaUtil(etapas, 5_000), 5_000 / 115_000);
  });
});
