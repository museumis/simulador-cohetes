import { describe, expect, it } from 'vitest';
import { buscarRaiz } from '../../src/simulacion/raiz';
import { esperarCercano } from '../ayudas';

describe('buscarRaiz', () => {
  it('encuentra raíces con precisión de máquina', () => {
    const cos = (x: number): number => Math.cos(x);
    esperarCercano(buscarRaiz(cos, 0, 3, cos(0), cos(3), 1e-14), Math.PI / 2);
    const cubica = (x: number): number => x ** 3 - 2;
    esperarCercano(buscarRaiz(cubica, 0, 2, -2, 6, 1e-14), Math.cbrt(2));
  });

  it('devuelve el extremo si la función se anula en él', () => {
    expect(buscarRaiz((x) => x, 0, 1, 0, 1, 1e-12)).toBe(0);
    expect(buscarRaiz((x) => x - 1, 0, 1, -1, 0, 1e-12)).toBe(1);
  });
});
