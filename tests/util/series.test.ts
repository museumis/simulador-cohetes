import { describe, expect, it } from 'vitest';
import { marcasLineales, pasoRedondo } from '../../src/util/escala';
import { diezmar, unirSeries } from '../../src/util/series';

describe('unirSeries', () => {
  it('une los x en orden e interpola cada serie en los x de la otra', () => {
    const u = unirSeries([0, 1, 2], [10, 11, 12], [0.5, 1, 3], [20, 21, 23]);
    expect(u.x).toEqual([0, 0.5, 1, 2, 3]);
    expect(u.a).toEqual([10, 10.5, 11, 12, null]);
    expect(u.b).toEqual([null, 20, 21, 22, 23]);
  });

  it('conserva los x repetidos de una discontinuidad y los huecos', () => {
    const u = unirSeries([0, 1, 1, 2], [0, 5, 6, 7], [0, 1, 3], [8, 9, 11]);
    expect(u.x).toEqual([0, 1, 1, 2, 3]);
    expect(u.a).toEqual([0, 5, 6, 7, null]);
    expect(u.b).toEqual([8, 9, 9, 10, 11]);
    expect(unirSeries([0, 2], [1, null], [1], [5]).a).toEqual([1, null, null]);
  });
});

describe('diezmar', () => {
  const xs = Array.from({ length: 10_001 }, (_, i) => i / 1000);
  const ys = xs.map((x) => Math.sin(10 * x) + (x === 5 ? 3 : 0));

  it('como mucho cuatro puntos por intervalo, conservando los extremos', () => {
    const d = diezmar(xs, ys, 0, 10, 100);
    expect(d.x.length).toBeLessThanOrEqual(400);
    expect(Math.max(...d.y)).toBe(Math.max(...ys));
    expect(Math.min(...d.y)).toBe(Math.min(...ys));
    expect(d.x[0]).toBe(0);
    expect(d.x.at(-1)).toBe(10);
    for (let i = 1; i < d.x.length; i++) expect(d.x[i]!).toBeGreaterThan(d.x[i - 1]!);
  });

  it('descarta los null y lo que queda fuera del intervalo', () => {
    const d = diezmar([0, 1, 2, 3, 4], [1, null, 3, 4, 5], 0.5, 3.5, 10);
    expect(d.x).toEqual([2, 3]);
  });
});

describe('marcas de los ejes', () => {
  it('paso redondo 1, 2 o 5 × 10ⁿ por encima del mínimo', () => {
    expect(pasoRedondo(0.7)).toBe(1);
    expect(pasoRedondo(1)).toBe(1);
    expect(pasoRedondo(1.2)).toBe(2);
    expect(pasoRedondo(3)).toBe(5);
    expect(pasoRedondo(6)).toBe(10);
    expect(pasoRedondo(0.03)).toBeCloseTo(0.05, 15);
  });

  it('marcas lineales sin error de redondeo', () => {
    expect(marcasLineales(0, 1, 5)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
    expect(marcasLineales(-0.05, 0.31, 4)).toEqual([0, 0.1, 0.2, 0.3]);
    expect(marcasLineales(1234, 5678, 4)).toEqual([2000, 4000]);
    expect(marcasLineales(1234, 5678, 5)).toEqual([2000, 3000, 4000, 5000]);
  });
});
