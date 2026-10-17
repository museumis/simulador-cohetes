import { describe, expect, it } from 'vitest';
import { estimarError, extrapolarRichardson, ordenObservado } from '../../src/analisis/richardson';
import { OPCIONES_POR_DEFECTO, simular } from '../../src/simulacion/simular';
import type { MetodoIntegracion } from '../../src/simulacion/tipos';
import { COHETE_PRUEBA } from '../simulacion/cohetes';

describe('extrapolación de Richardson', () => {
  it('es exacta para un error de la forma C·hᵖ', () => {
    // x(h) = 10 + 3·h⁴ con h = 0,2.
    const x = (h: number): number => 10 + 3 * h ** 4;
    const { error, extrapolado } = extrapolarRichardson(x(0.2), x(0.1), 4);
    expect(error).toBeCloseTo(3 * 0.2 ** 4, 14);
    expect(extrapolado).toBeCloseTo(10, 14);
    expect(ordenObservado(x(0.2), x(0.1), x(0.05))).toBeCloseTo(4, 10);
  });

  it('el orden observado es NaN si el redondeo domina', () => {
    expect(ordenObservado(1, 1, 1)).toBeNaN();
    expect(ordenObservado(1, 2, 1)).toBeNaN();
  });
});

describe('estimarError', () => {
  const entrada = (metodo: MetodoIntegracion, dt: number) => ({
    cohete: COHETE_PRUEBA,
    opciones: { ...OPCIONES_POR_DEFECTO, metodo, dt },
  });

  it('RK4: orden observado 4 y error estimado igual al real', () => {
    const e = estimarError(entrada('rk4', 0.8))!;
    expect(e.orden).toBe(4);
    const apogeo = e.filas.find((f) => f.metrica === 'apogeo')!;
    expect(apogeo.ordenObservado).toBeGreaterThan(3.8);
    expect(apogeo.ordenObservado).toBeLessThan(4.2);
    const exacto = simular(COHETE_PRUEBA, { dt: 0.025 }).resumen.apogeo;
    const errorReal = apogeo.valores[0] - exacto;
    expect(Math.abs(apogeo.error - errorReal)).toBeLessThan(0.1 * Math.abs(errorReal));
    expect(Math.abs(apogeo.extrapolado - exacto)).toBeLessThan(0.01 * Math.abs(errorReal));
  });

  it('Euler simpléctico: orden observado 1', () => {
    const e = estimarError(entrada('eulerSimplectico', 0.04))!;
    expect(e.orden).toBe(1);
    const apogeo = e.filas.find((f) => f.metrica === 'apogeo')!;
    expect(apogeo.ordenObservado).toBeGreaterThan(0.9);
    expect(apogeo.ordenObservado).toBeLessThan(1.1);
  });

  it('solo incluye las métricas de 2D en el modelo 2D', () => {
    const plano = { ...entrada('rk4', 0.4), opciones: { ...entrada('rk4', 0.4).opciones, modelo: '2D' as const } };
    expect(estimarError(entrada('rk4', 0.8))!.filas.map((f) => f.metrica)).not.toContain('alcanceImpacto');
    const alcance = estimarError(plano)!.filas.find((f) => f.metrica === 'alcanceImpacto')!;
    expect(alcance.ordenObservado).toBeGreaterThan(3);
    expect(alcance.ordenObservado).toBeLessThan(5);
  });

  it('no se puede estimar si dt/4 queda por debajo del paso mínimo', () => {
    expect(estimarError(entrada('rk4', 2e-4))).toBeNull();
  });

  it('Dormand–Prince: refina la tolerancia y el error es proporcional a ella', () => {
    const e = estimarError({
      cohete: COHETE_PRUEBA,
      opciones: { ...OPCIONES_POR_DEFECTO, metodo: 'dormandPrince', tolerancia: 1e-6 },
    })!;
    expect([e.adaptativo, e.razon, e.orden]).toEqual([true, 10, 1]);
    const apogeo = e.filas.find((f) => f.metrica === 'apogeo')!;
    expect(apogeo.ordenObservado).toBeGreaterThan(0.6);
    expect(apogeo.ordenObservado).toBeLessThan(1.6);
    const exacto = simular(COHETE_PRUEBA, { metodo: 'dormandPrince', tolerancia: 1e-12 }).resumen.apogeo;
    const errorReal = apogeo.valores[0] - exacto;
    expect(Math.abs(apogeo.error - errorReal)).toBeLessThan(0.5 * Math.abs(errorReal));
    expect(
      estimarError({ cohete: COHETE_PRUEBA, opciones: { ...OPCIONES_POR_DEFECTO, metodo: 'dormandPrince', tolerancia: 1e-12 } }),
    ).toBeNull();
  });
});
