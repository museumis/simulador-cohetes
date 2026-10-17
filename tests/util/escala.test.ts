import { describe, expect, it } from 'vitest';
import { valorRedondo } from '../../src/util/escala';

describe('valorRedondo', () => {
  it('elige 1, 2 o 5 × 10ⁿ por debajo del máximo', () => {
    expect(valorRedondo(1)).toBe(1);
    expect(valorRedondo(1.99)).toBe(1);
    expect(valorRedondo(3.7)).toBe(2);
    expect(valorRedondo(9.9)).toBe(5);
    expect(valorRedondo(0.05)).toBeCloseTo(0.05, 15);
    expect(valorRedondo(734_000)).toBe(500_000);
    expect(valorRedondo(8.2e6)).toBe(5e6);
  });

  it('rechaza valores no positivos', () => {
    expect(() => valorRedondo(0)).toThrow(RangeError);
    expect(() => valorRedondo(Number.NaN)).toThrow(RangeError);
  });
});
