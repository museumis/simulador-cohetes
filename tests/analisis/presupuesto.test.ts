import { describe, expect, it } from 'vitest';
import { finAscenso, presupuestoDeltaV } from '../../src/analisis/presupuesto';
import { simular } from '../../src/simulacion/simular';
import { COHETE_PRUEBA } from '../simulacion/cohetes';

const r = simular(COHETE_PRUEBA);
const apogeo = r.eventos.find((e) => e.tipo === 'apogeo')!;

describe('presupuesto de Δv', () => {
  it('el ascenso termina en el apogeo', () => {
    expect(finAscenso(r.muestras)).toBe(apogeo.t);
    expect(finAscenso(r.muestras.filter((m) => m.t < apogeo.t))).toBe(Infinity);
  });

  it('cierra en todo el ascenso y deja de ser aplicable al caer', () => {
    const fin = finAscenso(r.muestras);
    for (const m of r.muestras) {
      const p = presupuestoDeltaV(m, 0, fin);
      expect(p.aplicable).toBe(m.t <= apogeo.t);
      if (p.aplicable) expect(Math.abs(p.cierre)).toBeLessThan(1e-6 * Math.max(p.ideal, 1));
    }
  });

  it('en el apogeo todo el Δv ideal se ha perdido', () => {
    const p = presupuestoDeltaV(apogeo.estado, 0, finAscenso(r.muestras));
    expect(p.real).toBe(0);
    expect(p.resultante).toBeCloseTo(0, 6);
    expect(p.ideal).toBeCloseTo(p.gravedad + p.arrastre + p.contrapresion + p.direccion, 6);
  });

  it('cuenta la velocidad inicial', () => {
    const lanzado = simular(COHETE_PRUEBA, { altitudInicial: 1_000, velocidadInicial: 50 });
    const p = presupuestoDeltaV(lanzado.muestras[200]!, 50, finAscenso(lanzado.muestras));
    expect(p.aplicable).toBe(true);
    expect(Math.abs(p.cierre)).toBeLessThan(1e-6 * p.ideal);
  });
});
