import { describe, expect, it } from 'vitest';
import { crearIntegradorRK4, interpolarHermite, type FuncionDerivada } from '../../src/simulacion/integrador';
import { esperarCercano } from '../ayudas';

// Oscilador armónico: y'' = −y, con solución y = cos t, y' = −sin t.
const oscilador: FuncionDerivada = (y, dy) => {
  dy[0] = y[1]!;
  dy[1] = -y[0]!;
};

function integrarOscilador(h: number, pasos: number): Float64Array {
  const rk4 = crearIntegradorRK4(2);
  let y = new Float64Array([1, 0]);
  let siguiente = new Float64Array(2);
  const dy = new Float64Array(2);
  for (let i = 0; i < pasos; i++) {
    oscilador(y, dy);
    rk4.paso(oscilador, y, dy, h, siguiente);
    [y, siguiente] = [siguiente, y];
  }
  return y;
}

describe('RK4', () => {
  it('integra exactamente un polinomio de grado 4 (y = t⁴)', () => {
    // Sistema autónomo con el tiempo como componente: y' = 4 · t³.
    const f: FuncionDerivada = (y, dy) => {
      dy[0] = 1;
      dy[1] = 4 * y[0]! ** 3;
    };
    const rk4 = crearIntegradorRK4(2);
    const y = new Float64Array([1, 1]);
    const dy = new Float64Array(2);
    const salida = new Float64Array(2);
    f(y, dy);
    rk4.paso(f, y, dy, 0.5, salida);
    esperarCercano(salida[1]!, 1.5 ** 4);
  });

  it('es de orden 4: con la mitad de paso el error global baja unas 16 veces', () => {
    const tFinal = 10;
    const error = (pasos: number): number => {
      const y = integrarOscilador(tFinal / pasos, pasos);
      return Math.hypot(y[0]! - Math.cos(tFinal), y[1]! + Math.sin(tFinal));
    };
    const cociente = error(200) / error(400);
    expect(cociente).toBeGreaterThan(15);
    expect(cociente).toBeLessThan(17);
  });
});

describe('interpolación de Hermite', () => {
  it('reproduce exactamente un polinomio cúbico', () => {
    const p = (t: number): number => 2 * t ** 3 - t ** 2 + 3 * t - 5;
    const dp = (t: number): number => 6 * t ** 2 - 2 * t + 3;
    const [t0, h] = [1, 0.4];
    const salida = new Float64Array(1);
    for (const theta of [0, 0.25, 0.5, 0.9, 1]) {
      interpolarHermite(
        new Float64Array([p(t0)]),
        new Float64Array([dp(t0)]),
        new Float64Array([p(t0 + h)]),
        new Float64Array([dp(t0 + h)]),
        h,
        theta,
        salida,
      );
      esperarCercano(salida[0]!, p(t0 + theta * h));
    }
  });
});
