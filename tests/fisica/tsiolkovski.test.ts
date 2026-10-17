import { describe, expect, it } from 'vitest';
import { deltaV, deltaVEtapas, type EtapaTsiolkovski } from '../../src/fisica/tsiolkovski';
import { esperarCercano } from '../ayudas';

const sinEtapa2: EtapaTsiolkovski = { masaSeca: 0, masaPropelente: 0, ispVacio: 300 };

const etapasIsp450: [EtapaTsiolkovski, EtapaTsiolkovski] = [
  { masaSeca: 5_000, masaPropelente: 50_000, ispVacio: 450 },
  { masaSeca: 5_000, masaPropelente: 50_000, ispVacio: 450 },
];

describe('deltaV', () => {
  // Portado de NewtonServiceTest. Java daba 2302,487 restando g·t con t = 0,01 s: la pérdida
  // por gravedad la calculará la simulación, no la ecuación ideal. 1000 · ln(10).
  it('etapa única con razón de masas 10', () => {
    esperarCercano(deltaV(1000, 1, 0.1), 2302.5850929940457);
  });

  // Portados de getAceleracionTest con la u del test original.
  it('casos del proyecto Java', () => {
    esperarCercano(deltaV(4.4, 5_000, 4_000), 0.981831625782523);
    esperarCercano(deltaV(4.4, 6_000, 2_000), 4.833894070139683);
    esperarCercano(deltaV(4.4, 1_000, 200), 7.081526814710042);
    esperarCercano(deltaV(2_000, 115_000, 15_000), 4073.7638545220802);
  });

  it('vale 0 si no se consume masa', () => {
    expect(deltaV(3_000, 1_000, 1_000)).toBe(0);
    expect(deltaV(3_000, 0, 0)).toBe(0);
  });

  it('rechaza masas imposibles', () => {
    expect(() => deltaV(3_000, 1_000, 0)).toThrow(RangeError);
    expect(() => deltaV(3_000, 1_000, 2_000)).toThrow(RangeError);
    expect(() => deltaV(3_000, Number.NaN, 1_000)).toThrow(RangeError);
  });
});

describe('deltaVEtapas', () => {
  it('etapa única con carga útil', () => {
    const r = deltaVEtapas([{ masaSeca: 10_000, masaPropelente: 100_000, ispVacio: 300 }, sinEtapa2], 5_000);
    esperarCercano(r.etapa1, 300 * 9.80665 * Math.log(115_000 / 15_000));
    expect(r.etapa2).toBe(0);
  });

  // Portado de getAceleracionTest (último caso). Java usaba u = 4414,5 (450 s · 9,81) y daba
  // 2518,670 + 7909,722 = 10 428,392. Con u = 450 · g0 = 4412,9925 m/s:
  //   etapa 1: 4412,9925 · ln(115 000 / 65 000) = 2517,810181331
  //   etapa 2: 4412,9925 · ln(60 000 / 10 000)  = 7907,021099507
  it('dos etapas iguales con Isp 450 s', () => {
    const r = deltaVEtapas(etapasIsp450, 5_000);
    esperarCercano(r.etapa1, 2517.810181331);
    esperarCercano(r.etapa2, 7907.021099507);
    esperarCercano(r.total, 10424.831280839);
  });

  // Error 6 del proyecto Java: el mismo Isp para las dos etapas.
  //   etapa 1: 282 · g0 · ln(115 000 / 65 000) = 1577,827713634
  //   etapa 2: 348 · g0 · ln(6)                = 6114,762983619
  it('cada etapa usa su propio Isp', () => {
    const r = deltaVEtapas(
      [
        { masaSeca: 5_000, masaPropelente: 50_000, ispVacio: 282 },
        { masaSeca: 5_000, masaPropelente: 50_000, ispVacio: 348 },
      ],
      5_000,
    );
    esperarCercano(r.etapa1, 1577.827713634);
    esperarCercano(r.etapa2, 6114.762983619);
    esperarCercano(r.total, 7692.590697253);
  });

  // Error 2 del proyecto Java: tratar el cohete como una sola etapa sin soltar la estructura
  // de la etapa 1 da menos Δv: 4412,9925 · ln(115 000 / 15 000) = 8988,79 < 10 424,83.
  it('soltar la etapa 1 da más Δv que una sola etapa equivalente', () => {
    const r = deltaVEtapas(etapasIsp450, 5_000);
    expect(r.total).toBeGreaterThan(deltaV(450 * 9.80665, 115_000, 15_000));
  });
});
