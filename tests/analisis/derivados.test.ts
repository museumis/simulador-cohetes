import { describe, expect, it } from 'vitest';
import { calcularDerivados } from '../../src/analisis/derivados';
import { gravedad } from '../../src/fisica/gravedad';
import { simular } from '../../src/simulacion/simular';
import { esperarCercano } from '../ayudas';
import { COHETE_PRUEBA } from '../simulacion/cohetes';

describe('calcularDerivados', () => {
  const d = calcularDerivados(COHETE_PRUEBA);

  it('masas del cohete de prueba', () => {
    expect(d.masaDespegue).toBe(11_700);
    expect(d.etapas[0].masaInicial).toBe(11_700);
    expect(d.etapas[0].masaFinal).toBe(3_700);
    expect(d.etapas[1].masaInicial).toBe(1_700);
    expect(d.etapas[1].masaFinal).toBe(700);
    esperarCercano(d.fraccionCargaUtil, 200 / 11_700);
  });

  it('caudal y tiempo de combustión: ṁ = F_vac / (Isp_vac · g0)', () => {
    esperarCercano(d.etapas[0].caudal, 250_000 / (260 * 9.80665));
    esperarCercano(d.etapas[0].tiempoCombustion, 8_000 / d.etapas[0].caudal);
  });

  it('TWR inicial con el empuje a nivel del mar coincide con la simulación', () => {
    esperarCercano(d.etapas[0].twrInicial, (250_000 * 230) / 260 / (11_700 * gravedad(0)));
    esperarCercano(simular(COHETE_PRUEBA).muestras[0]!.twr, d.etapas[0].twrInicial, 1e-12);
  });

  it('Δv ideal total igual a la acumulada al final de la simulación', () => {
    esperarCercano(d.deltaVIdeal, d.etapas[0].deltaVIdeal + d.etapas[1].deltaVIdeal);
    esperarCercano(simular(COHETE_PRUEBA).resumen.deltaVIdeal, d.deltaVIdeal, 1e-9);
  });
});
