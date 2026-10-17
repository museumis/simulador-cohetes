import { describe, expect, it } from 'vitest';
import { cdSegunMach } from '../../src/fisica/arrastre';
import { caudalMasico, nivelRegulacion, tiempoCombustionRegulada, type Motor } from '../../src/fisica/motor';
import { escalonTabla, interpolarTabla, tramoTabla } from '../../src/fisica/tabla';
import { esperarCercano } from '../ayudas';

const tabla = [
  [0, 0.3],
  [1, 0.5],
  [3, 0.25],
] as const;

describe('tablas', () => {
  it('tramo, interpolación lineal y extremos', () => {
    expect([-1, 0, 0.5, 1, 2.9, 3, 9].map((x) => tramoTabla(tabla, x))).toEqual([-1, 0, 0, 1, 1, 2, 2]);
    esperarCercano(interpolarTabla(tabla, 0.5), 0.4);
    esperarCercano(interpolarTabla(tabla, 2), 0.375);
    expect(interpolarTabla(tabla, -1)).toBe(0.3);
    expect(interpolarTabla(tabla, 10)).toBe(0.25);
    expect(escalonTabla(tabla, 2, 1)).toBe(0.5);
    expect(escalonTabla([[5, 0.7]], 2, 1)).toBe(1);
  });

  it('Cd según el Mach: la tabla si la hay, si no el constante', () => {
    esperarCercano(cdSegunMach(tabla, 0.9, 0.5), 0.4);
    expect(cdSegunMach([], 0.9, 0.5)).toBe(0.9);
  });
});

describe('perfil de regulación', () => {
  const motor: Motor = { empujeVacio: 1_000_000, ispNivelMar: 270, ispVacio: 300 };
  const caudal = caudalMasico(motor);

  it('nivel por tramos, 1 antes del primero y sin perfil', () => {
    const perfil = [
      [10, 0.6],
      [20, 0.9],
    ] as const;
    expect([0, 9.99, 10, 15, 20, 100].map((t) => nivelRegulacion(perfil, t))).toEqual([1, 1, 0.6, 0.6, 0.9, 0.9]);
    expect(nivelRegulacion([], 50)).toBe(1);
  });

  it('tiempo de combustión recorriendo los tramos', () => {
    const propelente = 100 * caudal;
    esperarCercano(tiempoCombustionRegulada(motor, propelente, []), 100);
    // 10 s al 100 % y luego al 50 %: quedan 90 s de propelente nominal, que duran 180 s.
    esperarCercano(tiempoCombustionRegulada(motor, propelente, [[10, 0.5]]), 190);
    // Si se agota antes de un cambio, el cambio no interviene.
    esperarCercano(tiempoCombustionRegulada(motor, propelente, [[0, 0.5], [500, 1]]), 200);
  });
});
