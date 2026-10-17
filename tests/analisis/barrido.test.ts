import { describe, expect, it } from 'vitest';
import { barrer, valoresBarrido } from '../../src/analisis/barrido';
import { buscarCampo } from '../../src/simulacion/campos';
import { OPCIONES_POR_DEFECTO, simular } from '../../src/simulacion/simular';
import { COHETE_PRUEBA } from '../simulacion/cohetes';

const entrada = { cohete: COHETE_PRUEBA, opciones: { ...OPCIONES_POR_DEFECTO } };

describe('barrido de un parámetro', () => {
  it('valores equiespaciados con los extremos exactos', () => {
    expect(valoresBarrido(0, 1, 5)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    const v = valoresBarrido(0.1, 0.7, 7);
    expect(v[0]).toBe(0.1);
    expect(v[6]).toBe(0.7);
    expect(() => valoresBarrido(0, 1, 1)).toThrow(RangeError);
    expect(() => valoresBarrido(1, 1, 3)).toThrow(RangeError);
  });

  it('las métricas coinciden con una simulación completa', () => {
    const puntos = barrer(entrada, buscarCampo('masaCargaUtil'), [100, 200, 400]);
    const completa = simular({ ...COHETE_PRUEBA, masaCargaUtil: 200 });
    expect(puntos[1]!.metricas!.apogeo).toBe(completa.resumen.apogeo);
    expect(puntos[1]!.metricas!.maxQ).toBe(completa.resumen.maxQ);
    const apogeos = puntos.map((p) => p.metricas!.apogeo!);
    expect(apogeos[0]).toBeGreaterThan(apogeos[1]!);
    expect(apogeos[1]).toBeGreaterThan(apogeos[2]!);
  });

  it('un valor fuera de rango no detiene el barrido', () => {
    const avance: number[] = [];
    const puntos = barrer(entrada, buscarCampo('etapas[1].cd'), [-1, 0.3], (n) => avance.push(n));
    expect(puntos[0]!.metricas).toBeNull();
    expect(puntos[0]!.error).toContain('etapas[1].cd = -1');
    expect(puntos[1]!.metricas).not.toBeNull();
    expect(avance).toEqual([1, 2]);
  });
});
