import { describe, expect, it } from 'vitest';
import { compararEventos, compararMetricas, diferenciasEntrada } from '../../src/analisis/comparacion';
import { OPCIONES_POR_DEFECTO, simular } from '../../src/simulacion/simular';
import { COHETE_PRUEBA } from '../simulacion/cohetes';

const base = { cohete: COHETE_PRUEBA, opciones: { ...OPCIONES_POR_DEFECTO } };
const masCarga = { ...base, cohete: { ...COHETE_PRUEBA, masaCargaUtil: 300 } };
const rBase = simular(base.cohete, base.opciones);
const rCarga = simular(masCarga.cohete, masCarga.opciones);

describe('comparación de simulaciones', () => {
  it('una simulación comparada consigo misma no tiene diferencias', () => {
    for (const d of compararMetricas(rBase, rBase)) {
      if (Number.isFinite(d.actual)) expect(d.diferencia).toBe(0);
    }
    for (const d of compararEventos(rBase, rBase)) expect(d.diferencia).toBe(0);
    expect(diferenciasEntrada(base, base)).toEqual([]);
  });

  it('diferencia = actual − referencia, y relativa a |referencia|', () => {
    const apogeo = compararMetricas(rCarga, rBase).find((d) => d.metrica.id === 'apogeo')!;
    expect(apogeo.actual).toBe(rCarga.resumen.apogeo);
    expect(apogeo.referencia).toBe(rBase.resumen.apogeo);
    expect(apogeo.diferencia).toBeLessThan(0); // más carga, menos apogeo
    expect(apogeo.relativa).toBeCloseTo(apogeo.diferencia / rBase.resumen.apogeo, 15);
  });

  it('empareja los eventos por tipo y marca los que faltan con NaN', () => {
    const corta = simular(COHETE_PRUEBA, { duracionMaxima: 100 });
    const d = compararEventos(corta, rBase);
    expect(d.map((x) => x.tipo)).toEqual(rBase.eventos.map((e) => e.tipo));
    expect(d.find((x) => x.tipo === 'despegue')!.diferencia).toBe(0);
    expect(d.find((x) => x.tipo === 'impacto')!.actual).toBeNaN();
  });

  it('las métricas de 2D solo aparecen si alguna simulación es 2D', () => {
    expect(compararMetricas(rCarga, rBase).some((d) => d.metrica.solo2D)).toBe(false);
    const plana = simular(COHETE_PRUEBA, { modelo: '2D' });
    const d = compararMetricas(plana, rBase);
    const alcance = d.find((x) => x.metrica.id === 'alcanceImpacto')!;
    expect(alcance.actual).toBeGreaterThan(0);
    expect(alcance.referencia).toBeNaN();
    expect(diferenciasEntrada({ ...base, opciones: { ...base.opciones, modelo: '2D' } }, base)).toEqual([
      { nombre: 'modelo', unidad: '', actual: '2D', referencia: '1D' },
    ]);
  });

  it('lista los datos de entrada que cambian', () => {
    const otra = { cohete: masCarga.cohete, opciones: { ...base.opciones, metodo: 'eulerSimplectico' as const } };
    expect(diferenciasEntrada(otra, base)).toEqual([
      { nombre: 'método', unidad: '', actual: 'eulerSimplectico', referencia: 'rk4' },
      { nombre: 'carga útil', unidad: 'kg', actual: 300, referencia: 200 },
    ]);
  });
});
