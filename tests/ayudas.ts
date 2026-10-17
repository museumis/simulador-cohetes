import { expect } from 'vitest';

/** Comprueba que |real − esperado| ≤ tolerancia · |esperado|. */
export function esperarCercano(real: number, esperado: number, tolerancia = 1e-12): void {
  const error = Math.abs(real - esperado);
  expect(error, `real = ${real}, esperado = ${esperado}`).toBeLessThanOrEqual(tolerancia * Math.abs(esperado));
}
