import { describe, expect, it } from 'vitest';
import { simular } from '../../src/simulacion/simular';
import { estadoEn, indiceMuestra } from '../../src/util/interpolacion';
import { COHETE_PRUEBA } from '../simulacion/cohetes';

const resultado = simular(COHETE_PRUEBA);
const muestras = resultado.muestras;

describe('indiceMuestra', () => {
  it('devuelve la última muestra con t ≤ tiempo', () => {
    for (const i of [0, 1, 17, 500, muestras.length - 1]) {
      expect(indiceMuestra(muestras, muestras[i]!.t)).toBeGreaterThanOrEqual(i);
      expect(muestras[indiceMuestra(muestras, muestras[i]!.t)]!.t).toBe(muestras[i]!.t);
    }
    const i = indiceMuestra(muestras, 10.0123);
    expect(muestras[i]!.t).toBeLessThanOrEqual(10.0123);
    expect(muestras[i + 1]!.t).toBeGreaterThan(10.0123);
  });

  it('fuera del intervalo devuelve los extremos', () => {
    expect(indiceMuestra(muestras, -5)).toBe(0);
    expect(indiceMuestra(muestras, 1e9)).toBe(muestras.length - 1);
  });

  it('en una discontinuidad elige el estado posterior', () => {
    const separacion = resultado.eventos.find((e) => e.tipo === 'separacion')!;
    const estado = estadoEn(muestras, separacion.t);
    expect(estado.etapa).toBe(2);
    expect(estado.masa).toBeCloseTo(separacion.estado.masa, 6);
  });
});

describe('estadoEn', () => {
  it('coincide con las muestras en sus instantes', () => {
    const m = muestras[300]!;
    expect(estadoEn(muestras, m.t)).toBe(m);
  });

  it('interpola linealmente entre dos muestras', () => {
    const a = muestras[200]!;
    const b = muestras[201]!;
    const t = (a.t + b.t) / 2;
    const e = estadoEn(muestras, t);
    expect(e.t).toBe(t);
    expect(e.altitud).toBeCloseTo((a.altitud + b.altitud) / 2, 9);
    expect(e.perdidas.gravedad).toBeCloseTo((a.perdidas.gravedad + b.perdidas.gravedad) / 2, 9);
    expect(e.etapa).toBe(a.etapa);
  });
});
