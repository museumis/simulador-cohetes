import { describe, it } from 'vitest';
import { areaFrontal, derivadaPresionDinamica, fuerzaArrastre, presionDinamica } from '../../src/fisica/arrastre';
import { densidad, derivadaDensidad } from '../../src/fisica/atmosfera';
import { esperarCercano } from '../ayudas';

describe('arrastre', () => {
  it('área frontal de un círculo de 1 m de diámetro: π/4', () => {
    esperarCercano(areaFrontal(1), 0.7853981633974483);
    esperarCercano(areaFrontal(2), Math.PI);
  });

  // q = ½ · 1,225 · 100² = 6125 Pa; D = 6125 · 0,4 · π/4 = 1924,2255 N
  it('presión dinámica y fuerza de arrastre', () => {
    esperarCercano(presionDinamica(1.225, 100), 6125);
    esperarCercano(presionDinamica(1.225, -100), 6125);
    esperarCercano(fuerzaArrastre(6125, 0.4, areaFrontal(1)), 1924.2255003237483);
  });

  // q(t) a lo largo de una trayectoria h(t) = h0 + v0·t + ½·a·t², v(t) = v0 + a·t.
  it('dq/dt coincide con la diferencia finita a lo largo de una trayectoria', () => {
    const [h0, v0, a] = [9_000, 450, 20];
    const q = (t: number): number => presionDinamica(densidad(h0 + v0 * t + 0.5 * a * t * t), v0 + a * t);
    const paso = 1e-3;
    const finita = (q(paso) - q(-paso)) / (2 * paso);
    esperarCercano(derivadaPresionDinamica(densidad(h0), derivadaDensidad(h0), v0, a), finita, 1e-7);
  });
});
